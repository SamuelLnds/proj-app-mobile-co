// Lecture et validation du message `Setpoint` (section 6.2 de docs/conception/03-cartographie-technique.md).
// Analyseur JSON minimal, sans allocation ni Arduino : le message est un objet plat produit par l'API
// (JSON.stringify), dont seuls cinq champs sont lus. Le fichier est aussi compilé sur le poste, où un
// test compare ses verdicts à ceux du schéma Zod `SetpointSchema` de @solar/contracts.
// Choix expliqué dans docs/journal/decisions/D032-analyseur-json-minimal-du-firmware.md.
#pragma once

#include <cctype>
#include <cstddef>
#include <cstdlib>
#include <cstring>

#include "control.h"

enum class SetpointVerdict {
  Valid,       // tous les champs sont conformes
  Invalid,     // JSON lisible et identifiant lisible, mais un champ ne respecte pas le schéma
  Unreadable,  // JSON cassé ou identifiant illisible : le message est ignoré
};

constexpr size_t UUID_LENGTH = 36;

struct ParsedSetpoint {
  SetpointVerdict verdict;
  char id[UUID_LENGTH + 1];  // renseigné pour Valid et Invalid
  ControlMode mode;          // renseigné pour Valid
  int batteryShare;          // renseigné pour Valid ; NO_SHARE si `null`
};

// UUID au sens du schéma Zod : 8-4-4-4-12 chiffres hexadécimaux, version 1 à 8, variante 8, 9, a ou b
// (ainsi que les UUID spéciaux « tout à zéro » et « tout à f »).
inline bool isUuid(const char *text) {
  if (text == nullptr || std::strlen(text) != UUID_LENGTH) return false;
  bool allZero = true;
  bool allF = true;
  for (size_t i = 0; i < UUID_LENGTH; i++) {
    const char c = text[i];
    if (i == 8 || i == 13 || i == 18 || i == 23) {
      if (c != '-') return false;
      continue;
    }
    if (!std::isxdigit(static_cast<unsigned char>(c))) return false;
    if (c != '0') allZero = false;
    if (c != 'f' && c != 'F') allF = false;
  }
  if (allZero || allF) return true;
  const char version = text[14];
  const char variant = static_cast<char>(std::tolower(static_cast<unsigned char>(text[19])));
  return version >= '1' && version <= '8' && (variant == '8' || variant == '9' || variant == 'a' || variant == 'b');
}

namespace setpoint_detail {

constexpr size_t TEXT_CAPACITY = 64;

// Date ISO 8601 UTC comme `z.iso.datetime()` : AAAA-MM-JJThh:mm:ss, fraction facultative, suffixe Z.
inline bool isIsoUtc(const char *text) {
  const size_t length = std::strlen(text);
  if (length < 20) return false;
  auto digits = [&](size_t from, size_t count) {
    for (size_t i = from; i < from + count; i++) {
      if (text[i] < '0' || text[i] > '9') return false;
    }
    return true;
  };
  auto number = [&](size_t from, size_t count) {
    int value = 0;
    for (size_t i = from; i < from + count; i++) value = value * 10 + (text[i] - '0');
    return value;
  };
  if (!digits(0, 4) || text[4] != '-' || !digits(5, 2) || text[7] != '-' || !digits(8, 2) || text[10] != 'T' ||
      !digits(11, 2) || text[13] != ':' || !digits(14, 2) || text[16] != ':' || !digits(17, 2)) {
    return false;
  }
  size_t end = 19;
  if (text[end] == '.') {
    end++;
    const size_t fractionStart = end;
    while (text[end] >= '0' && text[end] <= '9') end++;
    if (end == fractionStart) return false;
  }
  if (text[end] != 'Z' || text[end + 1] != '\0') return false;
  const int year = number(0, 4);
  const int month = number(5, 2);
  const int day = number(8, 2);
  static const int daysInMonth[] = {31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31};
  if (month < 1 || month > 12 || day < 1) return false;
  const bool leap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
  if (day > daysInMonth[month - 1] + (month == 2 && leap ? 1 : 0)) return false;
  return number(11, 2) < 24 && number(14, 2) < 60 && number(17, 2) < 60;
}

// Curseur de lecture sur le texte reçu (qui n'est pas terminé par un zéro).
struct Reader {
  const char *p;
  const char *end;

  bool atEnd() const { return p >= end; }
  void skipSpace() {
    while (p < end && (*p == ' ' || *p == '\t' || *p == '\n' || *p == '\r')) p++;
  }
  bool consume(char c) {
    if (p < end && *p == c) {
      p++;
      return true;
    }
    return false;
  }
};

inline int hexValue(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}

// Chaîne JSON entre guillemets. `out` reçoit le texte décodé (tronqué à `capacity` - 1 octets) ;
// `overflow` indique que la chaîne était plus longue. Renvoie false si la syntaxe est invalide.
// Un échappement \uXXXX hors ASCII est remplacé par un octet de contrôle : aucun champ attendu ne le contient.
inline bool readString(Reader &r, char *out, size_t capacity, bool &overflow) {
  overflow = false;
  size_t length = 0;
  auto put = [&](char c) {
    if (length + 1 < capacity) out[length++] = c;
    else overflow = true;
  };
  if (!r.consume('"')) return false;
  while (!r.atEnd()) {
    const unsigned char c = static_cast<unsigned char>(*r.p++);
    if (c == '"') {
      out[length] = '\0';
      return true;
    }
    if (c < 0x20) return false;  // caractère de contrôle interdit dans une chaîne JSON
    if (c != '\\') {
      put(static_cast<char>(c));
      continue;
    }
    if (r.atEnd()) return false;
    const char escape = *r.p++;
    switch (escape) {
      case '"': put('"'); break;
      case '\\': put('\\'); break;
      case '/': put('/'); break;
      case 'b': put('\b'); break;
      case 'f': put('\f'); break;
      case 'n': put('\n'); break;
      case 'r': put('\r'); break;
      case 't': put('\t'); break;
      case 'u': {
        if (r.end - r.p < 4) return false;
        int code = 0;
        for (int i = 0; i < 4; i++) {
          const int digit = hexValue(*r.p++);
          if (digit < 0) return false;
          code = code * 16 + digit;
        }
        put(code > 0 && code < 0x80 ? static_cast<char>(code) : '\x01');
        break;
      }
      default: return false;
    }
  }
  return false;  // chaîne non terminée
}

// Nombre JSON (grammaire stricte). Renvoie false si la syntaxe est invalide.
inline bool readNumber(Reader &r, double &value) {
  const char *start = r.p;
  r.consume('-');
  if (r.consume('0')) {
    // un zéro initial ne peut pas être suivi d'un autre chiffre
  } else if (r.p < r.end && *r.p >= '1' && *r.p <= '9') {
    while (r.p < r.end && *r.p >= '0' && *r.p <= '9') r.p++;
  } else {
    return false;
  }
  if (r.consume('.')) {
    const char *fraction = r.p;
    while (r.p < r.end && *r.p >= '0' && *r.p <= '9') r.p++;
    if (r.p == fraction) return false;
  }
  if (r.p < r.end && (*r.p == 'e' || *r.p == 'E')) {
    r.p++;
    if (r.p < r.end && (*r.p == '+' || *r.p == '-')) r.p++;
    const char *exponent = r.p;
    while (r.p < r.end && *r.p >= '0' && *r.p <= '9') r.p++;
    if (r.p == exponent) return false;
  }
  char token[32];
  const size_t length = static_cast<size_t>(r.p - start);
  if (length >= sizeof(token)) {
    // Nombre démesuré : syntaxe correcte mais valeur sans intérêt ici.
    value = HUGE_VAL;
    return true;
  }
  std::memcpy(token, start, length);
  token[length] = '\0';
  value = std::strtod(token, nullptr);
  return true;
}

inline bool readLiteral(Reader &r, const char *word) {
  const size_t length = std::strlen(word);
  if (static_cast<size_t>(r.end - r.p) < length || std::strncmp(r.p, word, length) != 0) return false;
  r.p += length;
  return true;
}

inline bool skipValue(Reader &r, int depth);

// Saute un objet ou un tableau (champs inconnus), avec une profondeur limitée.
inline bool skipContainer(Reader &r, char open, char close, int depth) {
  if (depth > 8 || !r.consume(open)) return false;
  r.skipSpace();
  if (r.consume(close)) return true;
  while (true) {
    r.skipSpace();
    if (open == '{') {
      char key[TEXT_CAPACITY];
      bool overflow;
      if (!readString(r, key, sizeof(key), overflow)) return false;
      r.skipSpace();
      if (!r.consume(':')) return false;
      r.skipSpace();
    }
    if (!skipValue(r, depth + 1)) return false;
    r.skipSpace();
    if (r.consume(',')) continue;
    return r.consume(close);
  }
}

inline bool skipValue(Reader &r, int depth) {
  if (r.atEnd()) return false;
  char scratch[TEXT_CAPACITY];
  bool overflow;
  double number;
  switch (*r.p) {
    case '"': return readString(r, scratch, sizeof(scratch), overflow);
    case '{': return skipContainer(r, '{', '}', depth);
    case '[': return skipContainer(r, '[', ']', depth);
    case 't': return readLiteral(r, "true");
    case 'f': return readLiteral(r, "false");
    case 'n': return readLiteral(r, "null");
    default: return readNumber(r, number);
  }
}

}  // namespace setpoint_detail

// Lit un `Setpoint` dans `payload` (`length` octets, sans zéro final obligatoire).
// Valid : tous les champs respectent le schéma. Invalid : le JSON est lisible et porte un identifiant
// UUID, mais un champ est faux (l'objet répond alors `rejected` / `invalid_setpoint` pour cet identifiant).
// Unreadable : JSON cassé ou identifiant illisible (l'objet ignore le message et le journalise).
inline ParsedSetpoint parseSetpoint(const char *payload, size_t length) {
  using namespace setpoint_detail;
  ParsedSetpoint result = {SetpointVerdict::Unreadable, "", ControlMode::Automatic, NO_SHARE};
  if (payload == nullptr) return result;

  enum Kind { KindMissing, KindString, KindNumber, KindNull, KindOther };
  struct Field {
    Kind kind = KindMissing;
    char text[TEXT_CAPACITY] = "";
    bool overflow = false;
    double number = 0.0;
  };
  Field version, id, mode, share, issuedAt;

  Reader r{payload, payload + length};
  r.skipSpace();
  if (!r.consume('{')) return result;
  r.skipSpace();
  if (!r.consume('}')) {
    while (true) {
      r.skipSpace();
      char key[TEXT_CAPACITY];
      bool keyOverflow;
      if (!readString(r, key, sizeof(key), keyOverflow)) return result;
      r.skipSpace();
      if (!r.consume(':')) return result;
      r.skipSpace();
      if (r.atEnd()) return result;

      Field *target = nullptr;
      if (!keyOverflow) {
        if (std::strcmp(key, "v") == 0) target = &version;
        else if (std::strcmp(key, "id") == 0) target = &id;
        else if (std::strcmp(key, "mode") == 0) target = &mode;
        else if (std::strcmp(key, "batteryShare") == 0) target = &share;
        else if (std::strcmp(key, "issuedAt") == 0) target = &issuedAt;
      }
      if (target == nullptr) {
        if (!skipValue(r, 0)) return result;
      } else if (*r.p == '"') {
        target->kind = KindString;
        if (!readString(r, target->text, sizeof(target->text), target->overflow)) return result;
      } else if (*r.p == '-' || (*r.p >= '0' && *r.p <= '9')) {
        target->kind = KindNumber;
        if (!readNumber(r, target->number)) return result;
      } else if (*r.p == 'n') {
        target->kind = KindNull;
        if (!readLiteral(r, "null")) return result;
      } else {
        target->kind = KindOther;  // booléen, objet ou tableau : jamais valide pour ces champs
        if (!skipValue(r, 0)) return result;
      }

      r.skipSpace();
      if (r.consume(',')) continue;
      if (r.consume('}')) break;
      return result;
    }
  }
  r.skipSpace();
  if (!r.atEnd()) return result;  // texte après l'objet

  // Identifiant : sans lui, aucune réponse n'est possible.
  if (id.kind != KindString || id.overflow || !isUuid(id.text)) return result;
  std::memcpy(result.id, id.text, UUID_LENGTH + 1);
  result.verdict = SetpointVerdict::Invalid;

  if (version.kind != KindNumber || version.number != MESSAGE_VERSION) return result;
  if (mode.kind != KindString || mode.overflow || !parseMode(mode.text, result.mode)) return result;
  if (issuedAt.kind != KindString || issuedAt.overflow || !isIsoUtc(issuedAt.text)) return result;

  int batteryShare = NO_SHARE;
  if (share.kind == KindNumber) {
    if (!(share.number >= 0.0 && share.number <= 100.0) || share.number != std::floor(share.number)) return result;
    batteryShare = static_cast<int>(share.number);
    if (!isValidShare(batteryShare)) return result;
  } else if (share.kind != KindNull) {
    return result;  // absente, chaîne, booléen...
  }
  // La part est obligatoire en mode manuel et doit être `null` dans les autres modes.
  if ((result.mode == ControlMode::Manual) != (batteryShare != NO_SHARE)) return result;

  result.batteryShare = batteryShare;
  result.verdict = SetpointVerdict::Valid;
  return result;
}

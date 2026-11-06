import Svg, { Path } from "react-native-svg";

import { ICON_PATHS, type IconName } from "./icon-paths";
import { sizes } from "./tokens";

type IconProps = {
  name: IconName;
  color: string;
  size?: number;
};

/** Icône Phosphor, décorative : le texte qui l'accompagne porte le sens pour le lecteur d'écran. */
export function Icon({ name, color, size = sizes.icon }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {ICON_PATHS[name].map((d) => (
        <Path key={d} d={d} fill={color} />
      ))}
    </Svg>
  );
}

export type { IconName };

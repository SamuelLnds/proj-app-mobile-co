// Scène three.js de la vue 3D (bonus #58, D013). Ce fichier est chargé à la demande par Park3D :
// il importe expo-gl, module natif absent des versions de l'app construites avant #58.
import { Canvas } from "@react-three/fiber/native";

import type { ColorTokens } from "../theme/tokens";
import type { ParkScene } from "../utils/park-layout";

/** Panneau : 1,7 m × 1 m, incliné de 30° vers le sud, posé à 0,8 m du sol. */
const PANEL_SIZE: [number, number, number] = [1.7, 0.08, 1];
const PANEL_TILT = -Math.PI / 6;
const PANEL_HEIGHT = 0.8;

export interface Park3DSceneProps {
  scene: ParkScene;
  colors: ColorTokens;
  selectedId: string | null;
  onSelect: (panelId: string) => void;
}

export default function Park3DScene({ scene, colors, selectedId, onSelect }: Park3DSceneProps) {
  const { extent } = scene;
  const statusColor = {
    normal: colors.statusNormal,
    alert: colors.statusWarning,
    no_data: colors.statusNodata,
  } as const;
  return (
    <Canvas
      camera={{ position: [extent * 0.9, extent * 0.85, extent * 1.1], fov: 45 }}
      onCreated={({ camera }) => camera.lookAt(0, 0, 0)}
    >
      <ambientLight intensity={0.7} />
      <directionalLight position={[extent, extent * 2, extent * 0.5]} intensity={1.1} />
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[extent * 2.4, extent * 2.4]} />
        <meshStandardMaterial color={colors.mapGround} />
      </mesh>
      {scene.panels.map((panel) => {
        const selected = panel.id === selectedId;
        return (
          <mesh
            key={panel.id}
            position={[panel.x, PANEL_HEIGHT + (selected ? 0.3 : 0), panel.z]}
            rotation={[PANEL_TILT, 0, 0]}
            scale={selected ? 1.15 : 1}
            onClick={() => onSelect(panel.id)}
          >
            <boxGeometry args={PANEL_SIZE} />
            <meshStandardMaterial
              color={statusColor[panel.status]}
              // Sans couleur écrite en dur : la lueur de sélection a une intensité nulle sinon.
              emissive={colors.focus}
              emissiveIntensity={selected ? 0.4 : 0}
            />
          </mesh>
        );
      })}
    </Canvas>
  );
}

import type { ComponentProps } from "react";
import BibleCommandPalette from "../components/BibleCommandPalette";
import { BibleProvider } from "../bible/bibleStore";

type BibleCommandPaletteProps = ComponentProps<typeof BibleCommandPalette>;

export default function DockBibleCommandPaletteHost(props: BibleCommandPaletteProps) {
  return (
    <BibleProvider>
      <BibleCommandPalette {...props} />
    </BibleProvider>
  );
}

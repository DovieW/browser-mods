import { mountPopup } from "../../features/workspace/public-popup";
import { consumePaletteRequest } from "../../platform/chrome/palette";
void consumePaletteRequest().then((palette) => {
  mountPopup(palette);
});

import { mountPopup } from "../../features/workspace/public-ui";
import { consumePaletteRequest } from "../../platform/chrome/palette";
void consumePaletteRequest().then((palette) => {
  mountPopup(palette);
});

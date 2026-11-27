import { ActionMenu } from "./action-menu";
import { mountWorkspace } from "./app";

export function mountPopup(palette: boolean) {
  mountWorkspace({ mode: "popup", palette, RowMenu: ActionMenu });
}

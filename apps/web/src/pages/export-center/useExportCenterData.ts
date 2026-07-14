import { useExportCenterState } from "./useExportCenterState";
import { useExportCenterActions } from "./useExportCenterActions";

/**
 * 「导出与归档中心」的数据与动作集合。合并原 PdfExportPage（8 大导出场景）与
 * ArchivePackagePage（按期间的财税资料包总览）的全部状态与调用逻辑。
 * 状态加载见 useExportCenterState，动作处理见 useExportCenterActions。
 */
export function useExportCenterData() {
  const state = useExportCenterState();
  const actions = useExportCenterActions(state);

  return {
    ...state,
    ...actions,
    reloadArchivePackage: state.loadArchivePackage
  };
}

export type ExportCenterData = ReturnType<typeof useExportCenterData>;

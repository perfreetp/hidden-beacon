// 全局共享类型定义

/** 可拖拽物体在地面平面上的摆放状态 */
export interface ObjectPlacement {
  id: string;
  /** 玩具/台灯/小屋的种类标识 */
  kind: DraggableKind;
  /** 地面 XZ 坐标 */
  x: number;
  z: number;
  /** 朝向（弧度），玩具可旋转 */
  rotationY: number;
  /** 台灯额外保存高度，玩具忽略 */
  y?: number;
}

export type ToyKind = 'bunny' | 'bear' | 'duck';

export type DraggableKind = ToyKind | 'lamp' | 'house';
export interface LightSettings {
  /** 强度（0 ~ 4） */
  intensity: number;
  /** 色温（开尔文 1800K ~ 12000K） */
  temperature: number;
  /** 是否开启该光源及其阴影 */
  enabled: boolean;
}

export interface ShadowSettings {
  /** 每一级阴影贴图分辨率（像素边长） */
  mapSize: number;
  /** 级联切换距离 λ：0 均匀切分，1 完全按对数切分 */
  splitLambda: number;
  /** 阴影整体最远距离（米） */
  shadowMaxZ: number;
  /** PCF 软化核大小：0=低(1tap) 1=中(9tap) 2=高(25tap) */
  pcfKernel: number;
}

/** 一个完整的小剧场布置 */
export interface Theater {
  id: string;
  name: string;
  builtin: boolean;
  placements: ObjectPlacement[];
  sun: LightSettings;
  lamp: LightSettings;
  shadow: ShadowSettings;
  /** 太阳光水平方位角（弧度），模拟窗户朝向 */
  sunAzimuth: number;
  /** 太阳光仰角（弧度） */
  sunElevation: number;
  updatedAt: number;
}

export interface AppState {
  /** 当前激活的剧场 id */
  currentId: string;
  theaters: Theater[];
}

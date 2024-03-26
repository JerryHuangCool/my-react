//在beginWork阶段一般标记插入或移动，删除等与结构相关的副作用，而不标记与属性相关的副作用

export type Flags = number;

export const NoFlags = 0b00000000000000000000000000;
//插入
export const Placement = 0b00000000000000000000000010;
//更新属性
export const Update = 0b00000000000000000000000100;
//删除子节点
export const ChildDeletion = 0b00000000000000000000010000;
//表示本次fiber更新需要触发useEffect
export const PassiveEffect = 0b00000000000000000000100000;
export const Ref = 0b00000000000000000001000000;

export const MutationMask = Placement | Update | ChildDeletion | Ref;
export const LayoutMask = Ref;
//Deletion时需要执行useEffect的destory回调
export const PassiveMask = PassiveEffect | ChildDeletion;

//在beginWork阶段一般标记插入或移动，删除等与结构相关的副作用，而不标记与属性相关的副作用

export type Flags = number;

export const NoFlags = 0b0000000;
//插入
export const Placement = 0b0000001;
//更新属性
export const Update = 0b0000010;
//删除子节点
export const ChildDeletion = 0b0000100;
//表示本次fiber更新需要触发useEffect
export const PassiveEffect = 0b0001000;

export const MutationMask = Placement | Update | ChildDeletion;
//Deletion时需要执行useEffect的destory回调
export const PassiveMask = PassiveEffect | ChildDeletion;

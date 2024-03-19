import { FiberRootNode } from './fiber';

//lane模型在react中用来表示update操作的优先级，使用二进制表示
export type Lane = number;
//表示多个lane的集合
export type Lanes = number;

export const SyncLane = 0b0001;
export const NoLane = 0b0000;
export const NoLanes = 0b0000;
export function mergeLanes(lanA: Lane, laneB: Lane): Lanes {
	return lanA | laneB;
}

export function requestUpdateLane() {
	return SyncLane;
}

//返回Lanes中优先级最高的Lane
export function getHighestPriorityLane(lanes: Lanes): Lane {
	return lanes & -lanes;
}

//从lanes中移除lane
export function markRootFinished(root: FiberRootNode, lane: Lane) {
	root.pendingLanes &= ~lane;
}

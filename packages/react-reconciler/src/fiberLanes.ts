import {
	unstable_IdlePriority,
	unstable_ImmediatePriority,
	unstable_NormalPriority,
	unstable_UserBlockingPriority,
	unstable_getCurrentPriorityLevel
} from 'scheduler';
import { FiberRootNode } from './fiber';
import ReactCurrentBatchConfig from 'react/src/currentBatchConfig';

//lane模型在react中用来表示update操作的优先级，使用二进制表示
export type Lane = number;
//表示多个lane的集合
export type Lanes = number;

export const SyncLane = 0b00001;
export const NoLane = 0b00000;
export const NoLanes = 0b00000;
export const InputContinuousLane = 0b00010;
export const DefaultLane = 0b00100;
export const TransitionLane = 0b01000;
export const IdleLane = 0b10000;
export function mergeLanes(lanA: Lane, laneB: Lane): Lanes {
	return lanA | laneB;
}

export function requestUpdateLane() {
	//判断是否是transition
	const isTransition = ReactCurrentBatchConfig.transition !== null;
	if (isTransition) {
		return TransitionLane;
	}
	//从上下文环境中获取Scheduler优先级
	const currentSchedulerPriority = unstable_getCurrentPriorityLevel();
	const lane = schedilerPriorityToLane(currentSchedulerPriority);
	return lane;
}

//返回Lanes中优先级最高的Lane
export function getHighestPriorityLane(lanes: Lanes): Lane {
	return lanes & -lanes;
}

export function isSubsetOfLanes(set: Lanes, subset: Lane) {
	return (set & subset) === subset;
}

//从lanes中移除lane
export function markRootFinished(root: FiberRootNode, lane: Lane) {
	root.pendingLanes &= ~lane;
}

//从lane转换到调度器优先级
export function lanesToSchedulerPriority(lanes: Lanes) {
	const lane = getHighestPriorityLane(lanes);

	if (lane === SyncLane) {
		return unstable_ImmediatePriority;
	}
	if (lane === InputContinuousLane) {
		return unstable_UserBlockingPriority;
	}
	if (lane === DefaultLane) {
		return unstable_NormalPriority;
	}
	return unstable_IdlePriority;
}
//从调度器优先级转换到lane优先级
export function schedilerPriorityToLane(schedulerPriority: number) {
	if (schedulerPriority === unstable_ImmediatePriority) {
		return SyncLane;
	}
	if (schedulerPriority === unstable_UserBlockingPriority) {
		return InputContinuousLane;
	}
	if (schedulerPriority === unstable_NormalPriority) {
		return DefaultLane;
	}
	return NoLane;
}

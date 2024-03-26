import { scheduleMicroTask } from 'hostConfig';
import { beginWork } from './beginWork';
import {
	commitHookEffectListCreate,
	commitHookEffectListDestroy,
	commitHookEffectListUnmount,
	commitMutationEffects
} from './commitWork';
import { completeWork } from './completeWork';
import {
	FiberNode,
	FiberRootNode,
	PendingPassiveEffects,
	createWorkInProgress
} from './fiber';
import { MutationMask, NoFlags, PassiveMask } from './fiberFlags';
import {
	Lane,
	NoLane,
	SyncLane,
	getHighestPriorityLane,
	lanesToSchedulerPriority,
	markRootFinished,
	mergeLanes
} from './fiberLanes';
import { flushSyncCallbacks, scheduleSyncCallback } from './syncTaskQueue';
import { HostRoot } from './workTags';
import {
	unstable_scheduleCallback as scheduleCallback,
	unstable_NormalPriority as NormalPriority,
	unstable_shouldYield,
	unstable_cancelCallback
} from 'scheduler';
import { HookHasEffect, Passive } from './hookEffectTags';
//递归的完整循环
let workInProgress: FiberNode | null = null;
let wipRootRenderLane: Lane = NoLane;
//标识Effect已被调度
let rootDoesHasPassiveEffects: boolean = false;
type RootExitStatus = number;
const RootInComplete = 1;
const RootCompleted = 2;
//TODO执行过程中报错了

function prepareFreshStack(root: FiberRootNode, lane: Lane) {
	root.finishedLane = NoLane;
	root.finishedWork = null;
	workInProgress = createWorkInProgress(root.current, {});
	wipRootRenderLane = lane;
}

export function scheduleUpdateOnFiber(fiber: FiberNode, lane: Lane) {
	//串联更新机制和递归循环
	const root = markUpdateFromFiberToRoot(fiber);
	//在FiberRootNode上记录本次触发的update的lane
	markRootUpdated(root, lane);
	//从FiberRootNode开始更新流程,并实现调度
	ensureRootIsScheduled(root);
}
//schedule阶段入口
function ensureRootIsScheduled(root: FiberRootNode) {
	//实现判断机制，选出一个lane
	const updateLane = getHighestPriorityLane(root.pendingLanes);
	const existingCallback = root.callbackNode;
	if (updateLane === NoLane) {
		//没有更新
		if (existingCallback !== null) {
			unstable_cancelCallback(existingCallback);
		}
		root.callbackNode = null;
		root.callbackPriority = NoLane;
		return;
	}

	const curPriority = updateLane;
	const prevPriority = root.callbackPriority;
	if (curPriority === prevPriority) {
		//同优先级更新，不需要新的调度
		return;
	}

	if (existingCallback !== null) {
		unstable_cancelCallback(existingCallback);
	}
	let newCallbackNode = null;
	if (__DEV__) {
		console.log(
			`在${updateLane === SyncLane ? '微' : '宏'}任务中调度， 优先级：`,
			updateLane
		);
	}
	if (updateLane === SyncLane) {
		//同步优先级,用微任务调度
		// 构造同步回调函数数组
		scheduleSyncCallback(performSyncWorkOnRoot.bind(null, root));
		//根据宿主环境执行回调
		scheduleMicroTask(flushSyncCallbacks);
	} else {
		//其他优先级用宏任务调度
		const schedulerPriority = lanesToSchedulerPriority(updateLane);

		newCallbackNode = scheduleCallback(
			schedulerPriority,
			//@ts-ignore
			performConcurrentWorkOnRoot.bind(null, root)
		);
	}
	root.callbackNode = newCallbackNode;
	root.callbackPriority = curPriority;
}
function markRootUpdated(root: FiberRootNode, lane: Lane) {
	root.pendingLanes = mergeLanes(root.pendingLanes, lane);
}
//从当前fiber找到FiberRootNode
function markUpdateFromFiberToRoot(fiber: FiberNode) {
	let node = fiber;
	let parent = node.return;
	//hostRootFiber没有return指针
	while (parent !== null) {
		node = parent;
		parent = node.return;
	}
	if (node.tag === HostRoot) {
		return node.stateNode;
	}
	return null;
}
//并发更新入口
function performConcurrentWorkOnRoot(
	root: FiberRootNode,
	didTimeout: boolean
): any {
	//并发更新开始时需要保证useEffect回调都已经执行
	const curCallback = root.callbackNode;
	const didFlushPassiveEffect = flushPassiveEffects(root.pendingPassiveEffects);
	if (didFlushPassiveEffect) {
		if (root.callbackNode !== curCallback) {
			//effect触发的更新优先级比当前调度优先级高
			return null;
		}
	}

	const lane = getHighestPriorityLane(root.pendingLanes);
	const curCallbackNode = root.callbackNode;
	if (lane === NoLane) {
		return null;
	}
	const needSync = lane === SyncLane || didTimeout;

	// render阶段
	const exitStatus = renderRoot(root, lane, !needSync);
	ensureRootIsScheduled(root);
	if (exitStatus === RootInComplete) {
		//中断
		if (root.callbackNode !== curCallbackNode) {
			//以开启更高优先级调度，当前返回null
			return null;
		}
		//继续调度
		return performConcurrentWorkOnRoot.bind(null, root);
	}
	if (exitStatus === RootCompleted) {
		const finishedWork = root.current.alternate;
		root.finishedWork = finishedWork;
		root.finishedLane = lane;
		wipRootRenderLane = NoLane;
		//根据wip fiberNode树，以及树中的flags执行具体DOM操作
		//commit阶段的入口方法
		commitRoot(root);
	} else if (__DEV__) {
		console.error('还未实现并发更新结束状态');
	}
}
//递归方法,同步更新入口
function performSyncWorkOnRoot(root: FiberRootNode) {
	const nextLane = getHighestPriorityLane(root.pendingLanes);
	if (nextLane !== SyncLane) {
		//其他比SyncLane低的优先级
		// Nolane
		ensureRootIsScheduled(root);
		return;
	}
	if (__DEV__) {
		console.warn('render阶段开始');
	}
	//render阶段
	const exitStatus = renderRoot(root, nextLane, false);

	if (exitStatus === RootCompleted) {
		const finishedWork = root.current.alternate;
		root.finishedWork = finishedWork;
		root.finishedLane = nextLane;
		wipRootRenderLane = NoLane;
		//根据wip fiberNode树，以及树中的flags执行具体DOM操作
		//commit阶段的入口方法
		commitRoot(root);
	} else if (__DEV__) {
		console.error('还未实现同步更新结束状态');
	}
}
function renderRoot(root: FiberRootNode, lane: Lane, shouldTimeSlice: boolean) {
	if (__DEV__) {
		console.log(`开始${shouldTimeSlice ? '并发' : '同步'} 更新`);
	}
	if (wipRootRenderLane !== lane) {
		//初始化，让workInProgress指向第一个Fiber
		prepareFreshStack(root, lane);
	}

	//递归循环
	do {
		try {
			shouldTimeSlice ? workLoopConcurrent() : workLoopSync();
			break;
		} catch (err) {
			if (__DEV__) {
				console.warn('workLoop发生错误', err);
			}
			workInProgress = null;
		}
	} while (true);
	//中断执行
	if (shouldTimeSlice && workInProgress !== null) {
		return RootInComplete;
	}
	//render执行完
	if (!shouldTimeSlice && workInProgress !== null && __DEV__) {
		console.error(`render阶段结束时wip不应该不是null`);
	}
	//TODO 报错
	return RootCompleted;
}
function commitRoot(root: FiberRootNode) {
	//包含三个子阶段 beforeMutation mutation layout
	const finishedWork = root.finishedWork;
	if (finishedWork === null) {
		return;
	}

	if (__DEV__) {
		console.warn('commit阶段开始', finishedWork);
	}
	//移除本次更新的lane
	const lane = root.finishedLane;
	if (lane === NoLane && __DEV__) {
		console.error('Commit阶段finishedLane不应该是NoLane');
	}
	//重置
	root.finishedWork = null;
	root.finishedLane = NoLane;
	//移除本次lane
	markRootFinished(root, lane);
	if (
		(finishedWork.flags & PassiveMask) !== NoFlags ||
		(finishedWork.subtreeFlags & PassiveMask) !== NoFlags
	) {
		if (!rootDoesHasPassiveEffects) {
			rootDoesHasPassiveEffects = true;
			//调度副作用
			scheduleCallback(NormalPriority, () => {
				//执行副作用
				flushPassiveEffects(root.pendingPassiveEffects);
				return;
			});
		}
	}
	//判断是否存在3个子阶段需要执行的操作
	//需要判断 root flags 和 root subtreeFlags
	const subtreeHasEffect =
		(finishedWork.subtreeFlags & MutationMask) !== NoFlags;

	const rootHasEffect = (finishedWork.flags & MutationMask) !== NoFlags;

	if (subtreeHasEffect || rootHasEffect) {
		//beforeMutation
		//mutation Placement操作
		//两阶段之间实现双缓存 fiber树的切换
		commitMutationEffects(finishedWork, root);
		root.current = finishedWork;
		//layout
	} else {
		//无更新发生也需切换
		root.current = finishedWork;
	}
	rootDoesHasPassiveEffects = false;
	ensureRootIsScheduled(root);
}
//执行副作用
function flushPassiveEffects(pendingPassiveEffects: PendingPassiveEffects) {
	let didFlushPassiveEffect = false;
	//本次更新的任何create回调都必须在所有上一次更新的destroy回调执行后执行
	//遍历effect
	//先执行unmount
	pendingPassiveEffects.unmount.forEach((effect) => {
		didFlushPassiveEffect = true;
		commitHookEffectListUnmount(Passive, effect);
	});
	pendingPassiveEffects.unmount = [];
	//触发上次更新的所有destroy
	pendingPassiveEffects.update.forEach((effect) => {
		didFlushPassiveEffect = true;
		commitHookEffectListDestroy(Passive | HookHasEffect, effect);
	});
	pendingPassiveEffects.update.forEach((effect) => {
		didFlushPassiveEffect = true;
		commitHookEffectListCreate(Passive | HookHasEffect, effect);
	});
	pendingPassiveEffects.update = [];
	//执行Effect中触发的更新
	flushSyncCallbacks();
	return didFlushPassiveEffect;
}
function workLoopSync() {
	while (workInProgress !== null) {
		performUnitOfWork(workInProgress);
	}
}
function workLoopConcurrent() {
	while (workInProgress !== null && !unstable_shouldYield()) {
		performUnitOfWork(workInProgress);
	}
}
function performUnitOfWork(fiber: FiberNode) {
	//next 可能是fiber的子或null
	const next = beginWork(fiber, wipRootRenderLane);
	fiber.memoizedProps = fiber.pendingProps;

	//递归到最深层
	if (next === null) {
		completeUnitOfWork(fiber);
	} else {
		workInProgress = next;
	}
}

function completeUnitOfWork(fiber: FiberNode) {
	let node: FiberNode | null = fiber;
	do {
		completeWork(node);
		const sibling = node.sibling;
		if (sibling !== null) {
			workInProgress = sibling;
			return;
		}
		node = node.return;
		workInProgress = node;
	} while (node !== null);
}

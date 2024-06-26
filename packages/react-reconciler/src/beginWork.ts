//DFS递归中递阶段

import { ReactElementType } from 'shared/ReactTypes';
import {
	FiberNode,
	OffscreenProps,
	createFiberFromFragment,
	createFiberFromOffscreen,
	createWorkInProgress
} from './fiber';
import { UpdateQueue, processUpdateQueue } from './upadateQueue';
import {
	ContextProvider,
	Fragment,
	FunctionComponent,
	HostComponent,
	HostRoot,
	HostText,
	OffscreenComponent,
	SuspenseComponent
} from './workTags';
import { mountChildFibers, reconcilerChildFibers } from './childFibers';
import { renderWithHooks } from './fiberHooks';
import { Lane } from './fiberLanes';
import {
	ChildDeletion,
	DidCapture,
	NoFlags,
	Placement,
	Ref
} from './fiberFlags';
import { pushProvider } from './fiberContext';
import { pushSuspenseHandler } from './suspenseContext';
export const beginWork = (wip: FiberNode, renderLane: Lane) => {
	//比较，最终返回子FiberNode
	switch (wip.tag) {
		case HostRoot:
			//计算状态的最新值，同时创建子fiberNode
			return updateHostRoot(wip, renderLane);
		case HostComponent:
			//创建子fiberNode
			return updateHostComponent(wip);
		case HostText:
			//没有子节点
			return null;
		case FunctionComponent:
			return updateFunctionComponent(wip, renderLane);
		case Fragment:
			return updateFragment(wip);
		case ContextProvider:
			return updateContextProvider(wip);
		case SuspenseComponent:
			return updateSuspenseComponent(wip);
		case OffscreenComponent:
			return updateOffscreenComponent(wip);
		default:
			if (__DEV__) {
				console.warn('beginWork未实现的类型');
			}
			break;
	}
	return null;
};
function updateSuspenseComponent(wip: FiberNode) {
	const current = wip.alternate;
	const nextProps = wip.pendingProps;
	let showFallback = false;
	const didSuspend = (wip.flags & DidCapture) !== NoFlags;
	if (didSuspend) {
		showFallback = true;
		wip.flags &= ~DidCapture;
	}
	const nextPrimaryChildren = nextProps.children;
	const nextFallbackChildren = nextProps.fallback;

	pushSuspenseHandler(wip);
	if (current === null) {
		// mount
		if (showFallback) {
			//挂起
			return mountSuspenseFallbackChildren(
				wip,
				nextPrimaryChildren,
				nextFallbackChildren
			);
		} else {
			//正常
			return mountSuspensePrimaryChildren(wip, nextPrimaryChildren);
		}
	} else {
		//update
		if (showFallback) {
			//挂起
			return updateSuspenseFallbackChildren(
				wip,
				nextPrimaryChildren,
				nextFallbackChildren
			);
		} else {
			//正常
			return updateSuspensePrimaryChildren(wip, nextPrimaryChildren);
		}
	}
}

function updateSuspensePrimaryChildren(wip: FiberNode, primaryChildren: any) {
	const current = wip.alternate as FiberNode;
	const currentPrimaryChildFragment = current.child as FiberNode;
	const currentFallbackChildFragment: FiberNode | null =
		currentPrimaryChildFragment.sibling;
	const primaryChildProps: OffscreenProps = {
		mode: 'visible',
		children: primaryChildren
	};
	const primaryChildFragment = createWorkInProgress(
		currentPrimaryChildFragment,
		primaryChildProps
	);
	primaryChildFragment.return = wip;
	primaryChildFragment.sibling = null;
	wip.child = primaryChildFragment;
	if (currentFallbackChildFragment !== null) {
		const deletions = wip.deletions;
		if (deletions === null) {
			wip.deletions = [currentFallbackChildFragment];
			wip.flags |= ChildDeletion;
		} else {
			deletions.push(currentFallbackChildFragment);
		}
	}
	return primaryChildFragment;
}

function updateSuspenseFallbackChildren(
	wip: FiberNode,
	primaryChildren: any,
	fallbackChildren: any
) {
	const current = wip.alternate as FiberNode;
	const currentPrimaryChildFragment = current.child as FiberNode;
	const currentFallbackChildFragment: FiberNode | null =
		currentPrimaryChildFragment.sibling;
	const primaryChildProps: OffscreenProps = {
		mode: 'hidden',
		children: primaryChildren
	};
	const primaryChildFragment = createWorkInProgress(
		currentPrimaryChildFragment,
		primaryChildProps
	);
	let fallbackChildFragment;
	if (currentFallbackChildFragment !== null) {
		fallbackChildFragment = createWorkInProgress(
			currentFallbackChildFragment,
			fallbackChildren
		);
	} else {
		fallbackChildFragment = createFiberFromFragment(fallbackChildren, null);
		//需要手动标记挂载
		fallbackChildFragment.flags |= Placement;
	}
	fallbackChildFragment.return = wip;
	primaryChildFragment.return = wip;
	primaryChildFragment.sibling = fallbackChildFragment;
	wip.child = primaryChildFragment;

	return fallbackChildFragment;
}

function mountSuspensePrimaryChildren(wip: FiberNode, primaryChildren: any) {
	const primaryChildProps: OffscreenProps = {
		mode: 'visible',
		children: primaryChildren
	};
	const primaryChildFragment = createFiberFromOffscreen(primaryChildProps);
	wip.child = primaryChildFragment;
	primaryChildFragment.return = wip;
	return primaryChildFragment;
}

function mountSuspenseFallbackChildren(
	wip: FiberNode,
	primaryChildren: any,
	fallbackChildren: any
) {
	const primaryChildProps: OffscreenProps = {
		mode: 'hidden',
		children: primaryChildren
	};
	const primaryChildFragment = createFiberFromOffscreen(primaryChildProps);
	const fallbackChildFragment = createFiberFromFragment(fallbackChildren, null);

	//需要手动标记挂载
	fallbackChildFragment.flags |= Placement;

	primaryChildFragment.return = wip;
	fallbackChildFragment.return = wip;
	primaryChildFragment.sibling = fallbackChildFragment;
	wip.child = primaryChildFragment;

	return fallbackChildFragment;
}

function updateOffscreenComponent(wip: FiberNode) {
	const nextProps = wip.pendingProps;
	const nextChildren = nextProps.children;
	reconcileChildren(wip, nextChildren);
	return wip.child;
}

function updateContextProvider(wip: FiberNode) {
	const providerType = wip.type;
	const context = providerType._context;
	const newProps = wip.pendingProps;
	//实际react中，会在这里进行DFS，然后找到发生更新的子组件，在向上遍历标记沿途组件，目的是在性能优化bailout时知晓context需要更新,不会复用组件而是继续render
	pushProvider(context, newProps.value);

	const nextChildren = newProps.children;
	reconcileChildren(wip, nextChildren);
	return wip.child;
}
function updateFragment(wip: FiberNode) {
	const nextChildren = wip.pendingProps;
	reconcileChildren(wip, nextChildren);
	return wip.child;
}
function updateFunctionComponent(wip: FiberNode, renderLane: Lane) {
	const nextChildren = renderWithHooks(wip, renderLane);
	reconcileChildren(wip, nextChildren);
	return wip.child;
}

function updateHostRoot(wip: FiberNode, renderLane: Lane) {
	const baseState = wip.memoizedState;
	const updateQueue = wip.updateQueue as UpdateQueue<Element>;
	const pending = updateQueue.shared.pending;
	updateQueue.shared.pending = null;
	const { memoizedState } = processUpdateQueue(baseState, pending, renderLane);
	const current = wip.alternate;
	if (current !== null) {
		current.memoizedState = memoizedState;
	}
	wip.memoizedState = memoizedState;

	//将最新状态创建为子fiberNode
	const nextChildren = wip.memoizedState;
	reconcileChildren(wip, nextChildren);
	return wip.child;
}

function updateHostComponent(wip: FiberNode) {
	const nextProps = wip.pendingProps;
	const nextChildren = nextProps.children;
	markRef(wip.alternate, wip);
	reconcileChildren(wip, nextChildren);
	return wip.child;
}

function reconcileChildren(wip: FiberNode, children?: ReactElementType) {
	const current = wip.alternate;
	//比较子节点的current fiber 和 ReactElement 生成 wip fiber
	if (current !== null) {
		//update  处理删除节点的情况并复用节点
		wip.child = reconcilerChildFibers(wip, current?.child, children);
	} else {
		//mount 首屏渲染时，整个组件中只存在一个fiber即hostRootFiber对应的fiber在递归开始时作为wip被创建
		wip.child = mountChildFibers(wip, null, children);
	}
}

function markRef(current: FiberNode | null, workInprogress: FiberNode) {
	const ref = workInprogress.ref;

	if (
		(current === null && ref !== null) ||
		(current !== null && current.ref !== ref)
	) {
		//mount时存在ref或者update时ref发生变化
		workInprogress.flags |= Ref;
	}
}

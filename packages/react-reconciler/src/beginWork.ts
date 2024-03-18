//DFS递归中递阶段

import { ReactElementType } from 'shared/ReactTypes';
import { FiberNode } from './fiber';
import { UpdateQueue, processUpdateQueue } from './upadateQueue';
import {
	Fragment,
	FunctionComponent,
	HostComponent,
	HostRoot,
	HostText
} from './workTags';
import { mountChildFibers, reconcilerChildFibers } from './childFibers';
import { renderWithHooks } from './fiberHooks';

export const beginWork = (wip: FiberNode) => {
	//比较，最终返回子FiberNode
	switch (wip.tag) {
		case HostRoot:
			//计算状态的最新值，同时创建子fiberNode
			return updateHostRoot(wip);
		case HostComponent:
			//创建子fiberNode
			return updateHostComponent(wip);
		case HostText:
			//没有子节点
			return null;
		case FunctionComponent:
			return updateFunctionComponent(wip);
		case Fragment:
			return updateFragment(wip);
		default:
			if (__DEV__) {
				console.warn('beginWork未实现的类型');
			}
			break;
	}
	return null;
};
function updateFragment(wip: FiberNode) {
	const nextChildren = wip.pendingProps;
	reconcileChildren(wip, nextChildren);
	return wip.child;
}
function updateFunctionComponent(wip: FiberNode) {
	const nextChildren = renderWithHooks(wip);
	reconcileChildren(wip, nextChildren);
	return wip.child;
}

function updateHostRoot(wip: FiberNode) {
	const baseState = wip.memoizedState;
	const updateQueue = wip.updateQueue as UpdateQueue<Element>;
	const pending = updateQueue.shared.pending;
	updateQueue.shared.pending = null;
	const { memoizedState } = processUpdateQueue(baseState, pending);
	wip.memoizedState = memoizedState;

	//将最新状态创建为子fiberNode
	const nextChildren = wip.memoizedState;
	reconcileChildren(wip, nextChildren);
	return wip.child;
}

function updateHostComponent(wip: FiberNode) {
	const nextProps = wip.pendingProps;
	const nextChildren = nextProps.children;
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

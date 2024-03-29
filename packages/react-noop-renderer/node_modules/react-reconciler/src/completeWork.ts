//DFS递归中归阶段,构建离屏DOM树
//同时利用向上遍历的过程将在fiberNode的flags冒泡到父fiberNode

import {
	Container,
	Instance,
	appendInitialChild,
	createInstance,
	createTextInstance
} from 'hostConfig';
import { FiberNode } from './fiber';
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
import { NoFlags, Update, Ref, Visibility } from './fiberFlags';
import { popProvider } from './fiberContext';
import { popSuspenseHandler } from './suspenseContext';
//标记更新
function markUpdate(fiber: FiberNode) {
	fiber.flags |= Update;
}

function markRef(fiber: FiberNode) {
	fiber.flags |= Ref;
}
export const completeWork = (wip: FiberNode) => {
	const newProps = wip.pendingProps;
	const current = wip.alternate;
	switch (wip.tag) {
		case HostComponent:
			if (current !== null && wip.stateNode) {
				//update
				//判断props是否变化,若变化则加上Update标记
				// TODO: 应该比较各种 props 是否变化，记录更新 flags，然后在 commit 阶段再更新
				// fiberNode.updateQueue = [
				// 'className', 'xxx', 'style', 'xxx'
				// ]
				// 变的属性名，变的属性值，变的属性名，变的属性值
				// 这里的实现是为了省事
				markUpdate(wip);
				//update时若ref发生变化，标记Ref
				if (current.ref !== wip.ref) {
					markRef(wip);
				}
			} else {
				//mount
				//1.构建DOM，2将DOM插入DOM树
				//const instance = createInstance(wip.type, newProps);
				const instance = createInstance(wip.type, newProps);
				appendAllChildren(instance, wip);
				wip.stateNode = instance;
				//mount时,ref不为null标记Ref
				if (wip.ref !== null) {
					markRef(wip);
				}
			}
			bubbleProperties(wip);
			return null;
		case HostText:
			if (current !== null && wip.stateNode) {
				//update 主要处理标记UPdate的情况
				const oldText = current.memoizedProps.content;
				const newText = newProps.content;
				if (oldText !== newText) {
					markUpdate(wip);
				}
			} else {
				//mount
				//1.构建DOM，2将DOM插入DOM树
				const instance = createTextInstance(newProps.content);
				wip.stateNode = instance;
			}
			bubbleProperties(wip);
			return null;
		case HostRoot:
		case FunctionComponent:
		case Fragment:
		case OffscreenComponent:
			bubbleProperties(wip);
			return null;
		case ContextProvider:
			const context = wip.type._context;
			popProvider(context);
			bubbleProperties(wip);
			return null;
		case SuspenseComponent:
			popSuspenseHandler();
			const offscreenFiber = wip.child as FiberNode;
			const isHidden = offscreenFiber.pendingProps.mode === 'hidden';
			const currentOffscreenFiber = offscreenFiber.alternate;

			if (currentOffscreenFiber !== null) {
				// update
				const wasHidden = currentOffscreenFiber.pendingProps.mode === 'hidden';

				if (isHidden !== wasHidden) {
					offscreenFiber.flags |= Visibility;
					//将flags冒泡到SuspenseComponent对应的fiber
					bubbleProperties(offscreenFiber);
				}
			} else if (isHidden) {
				offscreenFiber.flags |= Visibility;
				bubbleProperties(offscreenFiber);
			}
			bubbleProperties(wip);
			return null;
		default:
			if (__DEV__) {
				console.warn('未处理的completeWork情况', wip);
			}
			break;
	}
};
//插入树
function appendAllChildren(parent: Container | Instance, wip: FiberNode) {
	//在parent中插入wip
	let node = wip.child;
	//递归，不仅插入自身还有同级兄弟节点
	while (node !== null) {
		if (node.tag === HostComponent || node.tag === HostText) {
			//执行插入
			appendInitialChild(parent, node?.stateNode);
		} else if (node.child !== null) {
			//向下找孩子
			node.child.return = node;
			node = node.child;
			continue;
		}
		if (node === wip) {
			return;
		}
		//无孩子找同级兄弟，往上
		while (node.sibling === null) {
			if (node.return === null || node.return === wip) {
				return;
			}
			node = node?.return;
		}
		node.sibling.return = node.return;
		node = node.sibling;
	}
}
//冒泡副作用
function bubbleProperties(wip: FiberNode) {
	let subtreeFlags = NoFlags;
	let child = wip.child;

	while (child !== null) {
		subtreeFlags |= child.subtreeFlags;
		subtreeFlags |= child.flags;
		child.return = wip;
		child = child.sibling;
	}
	wip.subtreeFlags |= subtreeFlags;
}

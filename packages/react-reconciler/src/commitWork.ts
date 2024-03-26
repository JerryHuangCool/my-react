import {
	Container,
	Instance,
	appendChildToContainer,
	commitUpdate,
	insertChildToContainer,
	removeChild
} from 'hostConfig';
import { FiberNode, FiberRootNode, PendingPassiveEffects } from './fiber';
import {
	ChildDeletion,
	Flags,
	LayoutMask,
	MutationMask,
	NoFlags,
	PassiveEffect,
	PassiveMask,
	Placement,
	Update,
	Ref
} from './fiberFlags';
import {
	FunctionComponent,
	HostComponent,
	HostRoot,
	HostText
} from './workTags';
import { Effect, FCUpdateQueue } from './fiberHooks';
import { HookHasEffect } from './hookEffectTags';
let nextEffect: FiberNode | null = null;

export const commitEffects = (
	phrase: 'mutation' | 'layout',
	mask: Flags,
	callback: (fiber: FiberNode, root: FiberRootNode) => void
) => {
	return (finishedWork: FiberNode, root: FiberRootNode) => {
		nextEffect = finishedWork;
		while (nextEffect !== null) {
			//向下遍历
			const child: FiberNode | null = nextEffect.child;
			if ((nextEffect.subtreeFlags & mask) !== NoFlags && child !== null) {
				nextEffect = child;
			} else {
				//向上遍历 可能是叶子节点也可能是不存在subtreeFlags的节点
				up: while (nextEffect !== null) {
					callback(nextEffect, root);
					const sibling: FiberNode | null = nextEffect.sibling;
					if (sibling !== null) {
						nextEffect = sibling;
						break up;
					}
					nextEffect = nextEffect.return;
				}
			}
		}
	};
};
const commitMutationEffectsOnFiber = (
	finishedWork: FiberNode,
	root: FiberRootNode
) => {
	const { flags, tag } = finishedWork;
	if ((flags & Placement) !== NoFlags) {
		commitPlacement(finishedWork);
		//移除Placement
		finishedWork.flags &= ~Placement;
	}
	//update
	if ((flags & Update) !== NoFlags) {
		commitUpdate(finishedWork);
		//移除Update
		finishedWork.flags &= ~Update;
	}
	//childDeletion
	if ((flags & ChildDeletion) !== NoFlags) {
		const deletions = finishedWork.deletions;
		if (deletions !== null) {
			deletions.forEach((childToDelete) => {
				commitDeletion(childToDelete, root);
			});
		}
		//移除ChildDeletion
		finishedWork.flags &= ~ChildDeletion;
	}
	if ((flags & PassiveEffect) !== NoFlags) {
		//收集回调,更新时
		commitPassiveEffect(finishedWork, root, 'update');
		finishedWork.flags &= ~PassiveEffect;
	}
	if ((flags & Ref) !== NoFlags && tag === HostComponent) {
		//mutation时，解绑ref
		safelyDetachRef(finishedWork);
	}
};

function safelyDetachRef(current: FiberNode) {
	const ref = current.ref;
	if (ref !== null) {
		if (typeof ref === 'function') {
			ref(null);
		} else {
			ref.current = null;
		}
	}
}
const commitLayoutEffectsOnFiber = (
	finishedWork: FiberNode,
	root: FiberRootNode
) => {
	const { flags, tag } = finishedWork;
	if ((flags & Ref) !== NoFlags && tag === HostComponent) {
		//绑定新的ref
		safelyAttachRef(finishedWork);
		//移除Ref
		finishedWork.flags &= ~Placement;
	}
};

function safelyAttachRef(fiber: FiberNode) {
	const ref = fiber.ref;
	if (ref !== null) {
		const instance = fiber.stateNode;
		if (typeof ref === 'function') {
			//函数类型
			ref(instance);
		} else {
			//对象类型
			ref.current = instance;
		}
	}
}

export const commitMutationEffects = commitEffects(
	'mutation',
	MutationMask | PassiveMask,
	commitMutationEffectsOnFiber
);

export const commitLayoutEffects = commitEffects(
	'layout',
	LayoutMask,
	commitLayoutEffectsOnFiber
);
//收集回调
function commitPassiveEffect(
	fiber: FiberNode,
	root: FiberRootNode,
	type: keyof PendingPassiveEffects
) {
	//update unmount
	if (
		fiber.tag !== FunctionComponent ||
		(type === 'update' && fiber.flags & PassiveEffect) === NoFlags
	) {
		return;
	}
	const updateQueue = fiber.updateQueue as FCUpdateQueue<any>;
	if (updateQueue !== null) {
		if (updateQueue.lastEffect === null && __DEV__) {
			console.error('当FC存在PassiveEffect flag时, 不应该不存在effect');
		}
		root.pendingPassiveEffects[type].push(updateQueue.lastEffect as Effect);
	}
}
//遍历effect的环状链表
function commitHookEffectList(
	flags: Flags,
	lastEffect: Effect,
	callback: (effect: Effect) => void
) {
	let effect = lastEffect.next as Effect;
	do {
		if ((effect.tag & flags) === flags) {
			callback(effect);
		}
		effect = effect.next as Effect;
	} while (effect !== lastEffect.next);
}
//组件卸载触发destroy
export function commitHookEffectListUnmount(flags: Flags, lastEffect: Effect) {
	commitHookEffectList(flags, lastEffect, (effect) => {
		const destroy = effect.destroy;
		if (typeof destroy === 'function') {
			destroy();
		}
		effect.tag &= ~HookHasEffect;
	});
}
//触发上次更新的destroy
export function commitHookEffectListDestroy(flags: Flags, lastEffect: Effect) {
	commitHookEffectList(flags, lastEffect, (effect) => {
		const destroy = effect.destroy;
		if (typeof destroy === 'function') {
			destroy();
		}
	});
}
//触发create
export function commitHookEffectListCreate(flags: Flags, lastEffect: Effect) {
	commitHookEffectList(flags, lastEffect, (effect) => {
		const create = effect.create;
		if (typeof create === 'function') {
			effect.destroy = create();
		}
	});
}
function recordHostChildrenToDelete(
	ChildrenToDelete: FiberNode[],
	unmountFiber: FiberNode
) {
	// 找到第一个 root host 节点
	const lastOne = ChildrenToDelete[ChildrenToDelete.length - 1];
	if (!lastOne) {
		ChildrenToDelete.push(unmountFiber);
	} else {
		//判断找到的每一节点是否是第一个找到的节点的兄弟
		let node = lastOne.sibling;
		while (node !== null) {
			if (unmountFiber === node) {
				ChildrenToDelete.push(unmountFiber);
			}
			node = node.sibling;
		}
	}
}
function commitDeletion(childToDelete: FiberNode, root: FiberRootNode) {
	//递归子树找到根将其移除
	const rootChildrenToDelete: FiberNode[] = [];
	//递归子树
	commitNestedComponent(childToDelete, (unmountFiber) => {
		switch (unmountFiber.tag) {
			case HostComponent:
				recordHostChildrenToDelete(rootChildrenToDelete, unmountFiber);
				//解绑ref
				safelyDetachRef(unmountFiber);
				return;
			case HostText:
				recordHostChildrenToDelete(rootChildrenToDelete, unmountFiber);
				return;
			case FunctionComponent:
				// useEffect 解绑ref
				//unmount时收集回调
				commitPassiveEffect(unmountFiber, root, 'unmount');
				return;
			default:
				if (__DEV__) {
					console.warn('未处理的unmount类型', unmountFiber);
				}
		}
	});
	//移除rootHostComponent的DOM
	if (rootChildrenToDelete.length !== 0) {
		const hostParent = getHostParent(childToDelete);
		if (hostParent !== null) {
			rootChildrenToDelete.forEach((node) => {
				removeChild(node.stateNode, hostParent);
			});
		}
	}
	childToDelete.return = null;
	childToDelete.child = null;
}
function commitNestedComponent(
	root: FiberNode,
	onCommitUnmount: (fiber: FiberNode) => void
) {
	let node = root;
	while (true) {
		onCommitUnmount(node);
		if (node.child !== null) {
			//向下遍历
			node.child.return = node;
			node = node.child;
			continue;
		}
		if (node === root) {
			//终止条件
			return;
		}
		while (node.sibling === null) {
			if (node.return === null || node.return === root) {
				return;
			}
			//向上归
			node = node.return;
		}
		node.sibling.return = node.return;
		node = node.sibling;
	}
}
const commitPlacement = (finishedWork: FiberNode) => {
	//需要知道父级DOM，和finishedWork 对应的DOM
	if (__DEV__) {
		console.warn('执行Placement操作', finishedWork);
	}
	//找到执行插入的兄弟
	const sibling = getHostSibling(finishedWork);
	// 找到parent 对应的DOM
	const hostParent = getHostParent(finishedWork);
	if (hostParent !== null) {
		insertOrAppendPlacementNodeIntoContainer(finishedWork, hostParent, sibling);
	}
};
//找到目标兄弟真实的host
function getHostSibling(fiber: FiberNode) {
	let node: FiberNode = fiber;
	findSibling: while (true) {
		while (node.sibling === null) {
			const parent = node.return;
			if (
				parent === null ||
				parent.tag === HostComponent ||
				parent.tag === HostRoot
			) {
				return null;
			}
			node = parent;
		}
		node.sibling.return = node.return;
		node = node.sibling;

		while (node.tag !== HostText && node.tag !== HostComponent) {
			//直接sibling不是host类型，向下遍历
			if ((node.flags & Placement) !== NoFlags) {
				//不稳定host，即被标识了Placement
				continue findSibling;
			}
			if (node.child === null) {
				continue findSibling;
			} else {
				node.child.return = node;
				node = node.child;
			}
		}
		if ((node.flags & Placement) === NoFlags) {
			return node.stateNode;
		}
	}
}
function getHostParent(fiber: FiberNode): Container | null {
	let parent = fiber.return;
	while (parent) {
		const parentTag = parent.tag;
		if (parentTag === HostComponent) {
			return parent.stateNode as Container;
		}
		if (parentTag === HostRoot) {
			return (parent.stateNode as FiberRootNode).container;
		}
		parent = parent.return;
	}
	if (__DEV__) {
		console.warn('未找到host parent');
	}
	return null;
}
//将Placement 对应的Node添加到Container中
function insertOrAppendPlacementNodeIntoContainer(
	finishedWork: FiberNode,
	hostParent: Container,
	before?: Instance
) {
	//先要找到fiber对应的host类型节点
	if (finishedWork.tag === HostComponent || finishedWork.tag === HostText) {
		if (before) {
			//插入操作
			insertChildToContainer(finishedWork.stateNode, hostParent, before);
		} else {
			appendChildToContainer(hostParent, finishedWork.stateNode);
		}

		return;
	}
	const child = finishedWork.child;
	if (child !== null) {
		//递归子节点
		insertOrAppendPlacementNodeIntoContainer(child, hostParent);
		let sibling = child.sibling;
		while (sibling !== null) {
			insertOrAppendPlacementNodeIntoContainer(sibling, hostParent);
			sibling = sibling.sibling;
		}
	}
}

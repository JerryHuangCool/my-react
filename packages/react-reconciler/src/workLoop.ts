import { beginWork } from './beginWork';
import { commitMutationEffects } from './commitWork';
import { completeWork } from './completeWork';
import { FiberNode, FiberRootNode, createWorkInProgress } from './fiber';
import { MutationMask, NoFlags } from './fiberFlags';
import { HostRoot } from './workTags';

//递归的完整循环
let workInProgress: FiberNode | null = null;

function prepareFreshStack(root: FiberRootNode) {
	workInProgress = createWorkInProgress(root.current, {});
}
export function scheduleUpdateOnFiber(fiber: FiberNode) {
	//串联更新机制和递归循环
	const root = markUpdateFromFiberToRoot(fiber);
	//从FiberRootNode开始更新流程
	renderRoot(root);
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
//递归方法
function renderRoot(root: FiberRootNode) {
	//初始化，让workInProgress指向第一个Fiber
	prepareFreshStack(root);

	//递归循环
	do {
		try {
			workLoop();
			break;
		} catch (err) {
			if (__DEV__) {
				console.warn('workLoop发生错误', err);
			}
			workInProgress = null;
		}
	} while (true);
	const finishedWork = root.current.alternate;
	root.finishedWork = finishedWork;
	//根据wip fiberNode树，以及树中的flags执行具体DOM操作
	//commit阶段的入口方法
	commitRoot(root);
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

	//重置
	root.finishedWork = null;
	//判断是否存在3个子阶段需要执行的操作
	//需要判断 root flags 和 root subtreeFlags
	const subtreeHasEffect =
		(finishedWork.subtreeFlags & MutationMask) !== NoFlags;

	const rootHasEffect = (finishedWork.flags & MutationMask) !== NoFlags;

	if (subtreeHasEffect || rootHasEffect) {
		//beforeMutation
		//mutation Placement操作
		//两阶段之间实现双缓存 fiber树的切换
		commitMutationEffects(finishedWork);
		root.current = finishedWork;
		//layout
	} else {
		//无更新发生也需切换
		root.current = finishedWork;
	}
}

function workLoop() {
	while (workInProgress !== null) {
		performUnitOfWork(workInProgress);
	}
}

function performUnitOfWork(fiber: FiberNode) {
	//next 可能是fiber的子或null
	const next = beginWork(fiber);
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

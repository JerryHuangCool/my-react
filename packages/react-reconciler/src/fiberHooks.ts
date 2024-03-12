import internals from 'shared/internals';
import { FiberNode } from './fiber';
import { Dispatcher } from 'react/src/currentDispatcher';
import { Dispatch } from 'react/src/currentDispatcher';
import {
	UpdateQueue,
	createUpdate,
	createUpdateQueue,
	enqueueUpdate
} from './upadateQueue';
import { scheduleUpdateOnFiber } from './workLoop';
import { Action } from 'shared/ReactTypes';
//将hooks所对应的数据保存在Fc所对应的fiberNode上,fiberNoded的memoizedState字段指向一个hooks链表，需要更新时调用顺序一致

let currentRenderingFiber: FiberNode | null = null;
//指向当前正在处理的hook
let workInprogressHook: Hook | null = null;
const { currentDispatcher } = internals;
//链表中的节点
interface Hook {
	memoizedState: any;
	updateQueue: unknown;
	next: Hook | null;
}
export function renderWithHooks(wip: FiberNode) {
	currentRenderingFiber = wip;
	wip.memoizedState = null;
	const current = wip.alternate;
	if (current !== null) {
		//update
	} else {
		//mount，当前集合指向mount时的hook集合
		currentDispatcher.current = HooksDispatcherOnMount;
	}
	const Component = wip.type;
	const props = wip.pendingProps;
	const children = Component(props);
	currentRenderingFiber = null;
	return children;
}

//在mount阶段hook集合
const HooksDispatcherOnMount: Dispatcher = {
	useState: mountState,
	useEffect: null
};
function dispatchSetState<State>(
	fiber: FiberNode,
	updateQueue: UpdateQueue<State>,
	action: Action<State>
) {
	const update = createUpdate(action);
	enqueueUpdate(updateQueue, update);
	scheduleUpdateOnFiber(fiber);
}
function mountState<State>(
	initialState: (() => State) | State
): [State, Dispatch<State>] {
	//找到当前useState对应的hook数据
	const hook = mountWorkInProgresHook();
	let memoizedState;
	if (initialState instanceof Function) {
		memoizedState = initialState();
	} else {
		memoizedState = initialState;
	}
	const queue = createUpdateQueue<State>();
	hook.updateQueue = queue;
	hook.memoizedState = memoizedState;
	//@ts-ignore
	const dispatch = dispatchSetState.bind(null, currentRenderingFiber, queue);
	queue.dispatch = dispatch;
	return [memoizedState, dispatch];
}

function mountWorkInProgresHook(): Hook {
	//mount时创建hook
	const hook: Hook = {
		memoizedState: null,
		updateQueue: null,
		next: null
	};
	if (workInprogressHook === null) {
		//mount时 第一个hook
		if (currentRenderingFiber === null) {
			throw new Error('请在函数组件内调用hook');
		} else {
			workInprogressHook = hook;
			currentRenderingFiber.memoizedState = workInprogressHook;
		}
	} else {
		// mount时后续hook
		workInprogressHook.next = hook;
		workInprogressHook = workInprogressHook.next;
	}
	return workInprogressHook;
}

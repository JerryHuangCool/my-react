import internals from 'shared/internals';
import { FiberNode } from './fiber';
import { Dispatcher } from 'react/src/currentDispatcher';
import { Dispatch } from 'react/src/currentDispatcher';
import {
	UpdateQueue,
	createUpdate,
	createUpdateQueue,
	enqueueUpdate,
	processUpdateQueue
} from './upadateQueue';
import { scheduleUpdateOnFiber } from './workLoop';
import { Action } from 'shared/ReactTypes';
import { Lane, NoLane, requestUpdateLane } from './fiberLanes';
//将hooks所对应的数据保存在Fc所对应的fiberNode上,fiberNoded的memoizedState字段指向一个hooks链表，需要更新时调用顺序一致

let currentRenderingFiber: FiberNode | null = null;
//指向当前正在处理的hook
let workInprogressHook: Hook | null = null;
let currentHook: Hook | null = null;
let renderLane: Lane = NoLane;
const { currentDispatcher } = internals;
//链表中的节点
interface Hook {
	memoizedState: any;
	updateQueue: unknown;
	next: Hook | null;
}
export function renderWithHooks(wip: FiberNode, lane: Lane) {
	currentRenderingFiber = wip;
	wip.memoizedState = null;
	renderLane = lane;
	const current = wip.alternate;
	if (current !== null) {
		//update
		currentDispatcher.current = HooksDispatcherOnUpdate;
	} else {
		//mount，当前集合指向mount时的hook集合
		currentDispatcher.current = HooksDispatcherOnMount;
	}
	const Component = wip.type;
	const props = wip.pendingProps;
	const children = Component(props);
	currentRenderingFiber = null;
	workInprogressHook = null;
	currentHook = null;
	renderLane = NoLane;
	return children;
}

//在mount阶段hook集合
const HooksDispatcherOnMount: Dispatcher = {
	useState: mountState,
	useEffect: null
};

//在uodate阶段hook集合
const HooksDispatcherOnUpdate: Dispatcher = {
	useState: updateState,
	useEffect: null
};
function dispatchSetState<State>(
	fiber: FiberNode,
	updateQueue: UpdateQueue<State>,
	action: Action<State>
) {
	const lane = requestUpdateLane();
	const update = createUpdate(action, lane);
	enqueueUpdate(updateQueue, update);
	scheduleUpdateOnFiber(fiber, lane);
}
function updateState<State>(): [State, Dispatch<State>] {
	//找到当前useState对应的hook数据
	const hook = updateWorkInProgresHook();
	//计算新state
	const queue = hook.updateQueue as UpdateQueue<State>;
	const pending = queue.shared.pending;
	if (pending !== null) {
		const { memoizedState } = processUpdateQueue(
			hook.memoizedState,
			pending,
			renderLane
		);
		hook.memoizedState = memoizedState;
	}
	return [hook.memoizedState, queue.dispatch as Dispatch<State>];
}
function updateWorkInProgresHook(): Hook {
	//分为交互阶段触发发更新和render阶段触发更新
	// TODO render阶段触发的更新
	let nextCurrentHook: Hook | null;
	if (currentHook === null) {
		//update时的第一个hook
		const current = currentRenderingFiber?.alternate;
		if (current !== null) {
			nextCurrentHook = current?.memoizedState;
		} else {
			nextCurrentHook = null;
		}
	} else {
		//后续hook
		nextCurrentHook = currentHook.next;
	}
	if (nextCurrentHook === null) {
		// mount/update u1 u2 u3
		// update       u1 u2 u3 u4
		throw new Error(
			`组件${currentRenderingFiber?.type}本次执行时的Hook比上次执行时多`
		);
	}
	currentHook = nextCurrentHook as Hook;
	//基于上一次的hook创建本次hook
	const newHook: Hook = {
		memoizedState: currentHook.memoizedState,
		updateQueue: currentHook.updateQueue,
		next: null
	};
	if (workInprogressHook === null) {
		//update时 第一个hook
		if (currentRenderingFiber === null) {
			throw new Error('请在函数组件内调用hook');
		} else {
			workInprogressHook = newHook;
			currentRenderingFiber.memoizedState = workInprogressHook;
		}
	} else {
		// update时后续hook
		workInprogressHook.next = newHook;
		workInprogressHook = workInprogressHook.next;
	}
	return workInprogressHook;
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

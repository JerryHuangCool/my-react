import internals from 'shared/internals';
import { FiberNode } from './fiber';
import { Dispatcher } from 'react/src/currentDispatcher';
import { Dispatch } from 'react/src/currentDispatcher';
import {
	Update,
	UpdateQueue,
	createUpdate,
	createUpdateQueue,
	enqueueUpdate,
	processUpdateQueue
} from './upadateQueue';
import { scheduleUpdateOnFiber } from './workLoop';
import { Action } from 'shared/ReactTypes';
import { Lane, NoLane, requestUpdateLane } from './fiberLanes';
import { Flags, PassiveEffect } from './fiberFlags';
import { HookHasEffect, Passive } from './hookEffectTags';
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
	baseState: any;
	baseQueue: Update<any> | null;
}
export interface Effect {
	tag: Flags;
	create: EffectCallbak | void;
	destroy: EffectCallbak | void;
	deps: EffectDeps;
	next: Effect | null;
}
export interface FCUpdateQueue<State> extends UpdateQueue<State> {
	lastEffect: Effect | null;
}
type EffectCallbak = () => void;
type EffectDeps = any[] | null;
export function renderWithHooks(wip: FiberNode, lane: Lane) {
	currentRenderingFiber = wip;
	wip.memoizedState = null;
	//重置effect链表
	wip.updateQueue = null;
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
	useEffect: mountEffect
};

//在uodate阶段hook集合
const HooksDispatcherOnUpdate: Dispatcher = {
	useState: updateState,
	useEffect: updateEffect
};
function mountEffect(create: EffectCallbak | void, deps: EffectDeps | void) {
	//在commit阶段useEffect会被异步调度，在DOM渲染完成后异步执行，不会阻塞DOM渲染，而useLayoutEffect在layout阶段同步执行，会阻塞DOM渲染
	//useInsertionEffect 与useLayoutEffect Hook非常相似，但它不能访问DOM节点的引用,用于插入样式 CSS-in-JS库中使用
	const hook = mountWorkInProgresHook();
	const nextDeps = deps === undefined ? null : deps;
	(currentRenderingFiber as FiberNode).flags |= PassiveEffect;
	hook.memoizedState = pushEffect(
		Passive | HookHasEffect,
		create,
		undefined,
		nextDeps
	);
}
function updateEffect(create: EffectCallbak | void, deps: EffectDeps | void) {
	//在commit阶段useEffect会被异步调度，在DOM渲染完成后异步执行，不会阻塞DOM渲染，而useLayoutEffect在layout阶段同步执行，会阻塞DOM渲染
	//useInsertionEffect 与useLayoutEffect Hook非常相似，但它不能访问DOM节点的引用,用于插入样式 CSS-in-JS库中使用
	const hook = updateWorkInProgresHook();
	const nextDeps = deps === undefined ? null : deps;
	let destroy: EffectCallbak | void;
	if (currentHook !== null) {
		//上一次的effect
		const prevEffect = currentHook.memoizedState as Effect;
		destroy = prevEffect.destroy;
		if (nextDeps !== null) {
			//浅比较依赖
			const prevDeps = prevEffect.deps;
			if (areHookInputsEqual(nextDeps, prevDeps)) {
				hook.memoizedState = pushEffect(Passive, create, destroy, nextDeps);
				return;
			}
		}
		//不相等
		(currentRenderingFiber as FiberNode).flags |= PassiveEffect;
		hook.memoizedState = pushEffect(
			Passive | HookHasEffect,
			create,
			destroy,
			nextDeps
		);
	}
}
function areHookInputsEqual(nextDeps: EffectDeps, prevDeps: EffectDeps) {
	if (prevDeps === null || nextDeps === null) {
		return false;
	}
	for (let i = 0; i < prevDeps.length && i < nextDeps.length; i++) {
		if (Object.is(prevDeps[i], nextDeps[i])) {
			continue;
		}
		return false;
	}
	return true;
}
function pushEffect(
	hookFlags: Flags,
	create: EffectCallbak | void,
	destroy: EffectCallbak | void,
	deps: EffectDeps
): Effect {
	const effect: Effect = {
		tag: hookFlags,
		create,
		destroy,
		deps,
		//指向下一个Effect
		next: null
	};
	const fiber = currentRenderingFiber as FiberNode;
	const updateQueue = fiber.updateQueue as FCUpdateQueue<any>;
	if (updateQueue === null) {
		const updateQueue = createFcUpdateQueue();
		fiber.updateQueue = updateQueue;
		effect.next = effect;
		updateQueue.lastEffect = effect;
	} else {
		//插入effect,构造环状链表
		const lastEffect = updateQueue.lastEffect;
		if (lastEffect === null) {
			effect.next = effect;
			updateQueue.lastEffect = effect;
		} else {
			const firstEffect = lastEffect.next;
			lastEffect.next = effect;
			effect.next = firstEffect;
			updateQueue.lastEffect = effect;
		}
	}
	return effect;
}
function createFcUpdateQueue<State>() {
	const updateQueue = createUpdateQueue<State>() as FCUpdateQueue<State>;
	updateQueue.lastEffect = null;
	return updateQueue;
}
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
	const baseState = hook.baseState;
	const pending = queue.shared.pending;

	const current = currentHook as Hook;
	let baseQueue = current.baseQueue;
	if (pending !== null) {
		// pending update 和 baseQueue 中的update保存在current中
		if (baseQueue !== null) {
			const baseFirst = baseQueue.next;
			const pendingFirst = pending.next;

			baseQueue.next = pendingFirst;
			pending.next = baseFirst;
		}
		baseQueue = pending;
		//保存在current中
		current.baseQueue = pending;
		queue.shared.pending = null;

		if (baseQueue !== null) {
			const {
				memoizedState,
				baseQueue: newBaseQueue,
				baseState: newBaseState
			} = processUpdateQueue(baseState, baseQueue, renderLane);
			hook.memoizedState = memoizedState;
			hook.baseState = newBaseState;
			hook.baseQueue = newBaseQueue;
		}
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
		next: null,
		baseQueue: currentHook.baseQueue,
		baseState: currentHook.baseState
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
		next: null,
		baseQueue: null,
		baseState: null
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

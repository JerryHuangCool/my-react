import { Dispatch } from 'react/src/currentDispatcher';
import { Action } from 'shared/ReactTypes';
import { Lane } from './fiberLanes';
//触发更新的方式 ReactDOM.createRoot().render  this.setState  useState的dispatch方法
//用于触发更新数据的数据结构Update
export interface Update<State> {
	//action应能够接受两种形式的更新，即状态的最新值和返回状态最新值的函数
	action: Action<State>;
	lane: Lane;
	next: Update<any> | null;
}
//保存Update的数据结构
export interface UpdateQueue<State> {
	shared: {
		pending: Update<State> | null;
	};
	dispatch: Dispatch<State> | null;
}
//创建Update实例
export const createUpdate = <State>(
	action: Action<State>,
	lane: Lane
): Update<State> => {
	return {
		action,
		lane,
		next: null
	};
};

//创建UpdateQueue实例
export const createUpdateQueue = <State>() => {
	return {
		shared: {
			pending: null
		},
		dispatch: null
	} as UpdateQueue<State>;
};

//向UpdateQueue中添加Update
//之前的实现只保留了最新的update，在多次触发更新时会被覆盖，需要用链表保存所有update
export const enqueueUpdate = <State>(
	updateQueue: UpdateQueue<State>,
	update: Update<State>
) => {
	const pending = updateQueue.shared.pending;
	//构造环状链表
	if (pending === null) {
		update.next = update;
	} else {
		update.next = pending.next;
		pending.next = update;
	}
	updateQueue.shared.pending = update;
};

//UpdateQueue消费Update的方法，基于基础的baseState,根据Update的action计算出memoizedState
export const processUpdateQueue = <State>(
	baseState: State,
	pendingUpdate: Update<State> | null,
	renderLane: Lane
): { memoizedState: State } => {
	const result: ReturnType<typeof processUpdateQueue<State>> = {
		memoizedState: baseState
	};
	if (pendingUpdate !== null) {
		//第一个插入的update
		const first = pendingUpdate.next;
		let pending = pendingUpdate.next as Update<any>;
		do {
			const updateLane = pending.lane;
			if (updateLane === renderLane) {
				//baseState 1 update (x) => 4x -> memoizedState 4
				const action = pending.action;
				if (action instanceof Function) {
					baseState = action(baseState);
				} else {
					//baseState 1 update2 -> memoizedState 2
					baseState = action;
				}
			} else {
				if (__DEV__) {
					console.error('不应该进入 updateLane !== renderLane 逻辑');
				}
			}
			pending = pending.next as Update<any>;
		} while (pending !== first);
	}
	result.memoizedState = baseState;
	return result;
};

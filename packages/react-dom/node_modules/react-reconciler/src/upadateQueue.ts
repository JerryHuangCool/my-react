import { Action } from 'shared/ReactTypes';
//触发更新的方式 ReactDOM.createRoot().render  this.setState  useState的dispatch方法
//用于触发更新数据的数据结构Update
export interface Update<State> {
	//action应能够接受两种形式的更新，即状态的最新值和返回状态最新值的函数
	action: Action<State>;
}
//保存Update的数据结构
export interface UpdateQueue<State> {
	shared: {
		pending: Update<State> | null;
	};
}
//创建Update实例
export const createUpdate = <State>(action: Action<State>): Update<State> => {
	return {
		action
	};
};

//创建UpdateQueue实例
export const createUpdateQueue = <State>() => {
	return {
		shared: {
			pending: null
		}
	} as UpdateQueue<State>;
};

//向UpdateQueue中添加Update
export const enqueueUpdate = <State>(
	updateQueue: UpdateQueue<State>,
	update: Update<State>
) => {
	updateQueue.shared.pending = update;
};

//UpdateQueue消费Update的方法，基于基础的baseState,根据Update的action计算出memoizedState
export const processUpdateQueue = <State>(
	baseState: State,
	pendingUpdate: Update<State> | null
): { memoizedState: State } => {
	const result: ReturnType<typeof processUpdateQueue<State>> = {
		memoizedState: baseState
	};
	if (pendingUpdate !== null) {
		//baseState 1 update (x) => 4x -> memoizedState 4
		const action = pendingUpdate.action;
		if (action instanceof Function) {
			result.memoizedState = action(baseState);
		} else {
			//baseState 1 update2 -> memoizedState 2
			result.memoizedState = action;
		}
	}
	return result;
};

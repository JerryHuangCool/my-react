import { Action } from 'shared/ReactTypes';

//内部数据共享层，将在react-reconciler中不同阶段需要使用的的hooks，结构等设置成不同的集合，在数据共享层设置对应的当前集合暴露给React包使用,共享数据存储在shared中
//这里对应集合
export interface Dispatcher {
	useState: <T>(initialState: (() => T) | T) => [T, Dispatch<T>];
	useEffect: (callback: () => void | void, deps: any[] | void) => void;
	useTransition: () => [boolean, (callback: () => void) => void];
}

export type Dispatch<State> = (action: Action<State>) => void;
const currentDispatcher: { current: Dispatcher | null } = {
	current: null
};
export const resolveDispatcher = (): Dispatcher => {
	const dispatcher = currentDispatcher.current;
	if (dispatcher === null) {
		throw new Error('hook只能在函数组件中执行');
	}
	return dispatcher;
};
export default currentDispatcher;

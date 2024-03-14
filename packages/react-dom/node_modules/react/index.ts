import { Dispatcher, resolveDispatcher } from './src/currentDispatcher';
import currentDispatcher from './src/currentDispatcher';
import { jsxDEV, jsx, isValidElement as isValidElementFn } from './src/jsx';
//React打包入口

export const useState: Dispatcher['useState'] = (initalState: any) => {
	const dispatcher = resolveDispatcher();
	return dispatcher.useState(initalState);
};
//内部数据共享层
export const _SECRET_INTERNSLD_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = {
	currentDispatcher
};

export const version = '0.0.0';
//TODO 根据环境区分使用jsx/jsxDEV
export const createElement = jsx;
export const isValidElement = isValidElementFn;

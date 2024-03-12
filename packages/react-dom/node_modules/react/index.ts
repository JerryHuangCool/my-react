import { Dispatcher, resolveDispatcher } from './src/currentDispatcher';
import currentDispatcher from './src/currentDispatcher';
import { jsxDEV } from './src/jsx';
//React打包入口

export const useState: Dispatcher['useState'] = (initalState: any) => {
	const dispatcher = resolveDispatcher();
	return dispatcher.useState(initalState);
};
//内部数据共享层
export const _SECRET_INTERNSLD_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = {
	currentDispatcher
};

export default {
	version: '0.0.0',
	createElement: jsxDEV
};

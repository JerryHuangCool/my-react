//实现触发更新mount时调用的api
import { Container } from 'hostConfig';
import { FiberNode, FiberRootNode } from './fiber';
import { HostRoot } from './workTags';
import {
	UpdateQueue,
	createUpdate,
	createUpdateQueue,
	enqueueUpdate
} from './upadateQueue';
import { ReactElementType } from 'shared/ReactTypes';
import { scheduleUpdateOnFiber } from './workLoop';

//ReactDOM.createRoot()时调用,创建整个应用的FiberRootNode，并连接hostRootFiber
export function createContainer(container: Container) {
	const hostRootFiber = new FiberNode(HostRoot, {}, null);
	const root = new FiberRootNode(container, hostRootFiber);
	hostRootFiber.updateQueue = createUpdateQueue();
	return root;
}

//执行render方法时调用，创建update并将其添加进UpdateQueue中,连接首屏渲染与更新机制
export function updateContainer(
	element: ReactElementType | null,
	root: FiberRootNode
) {
	const hostRootFiber = root.current;
	//代表此次更新跟element相关
	const update = createUpdate<ReactElementType | null>(element);
	//添加update
	enqueueUpdate(
		hostRootFiber.updateQueue as UpdateQueue<ReactElementType | null>,
		update
	);
	//连接更新机制与递归循环
	scheduleUpdateOnFiber(hostRootFiber);
	return element;
}

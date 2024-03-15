//Jquery 通过过程驱动ui更新，react vue等框架通过状态驱动ui更新,并不直接调用宿主环境的api
//react 和vue都通过运行时核心模块(reconciler 和 renderer) 调用宿主环境api进行视图更新
//react 通过jsx描述ui，没有编译优化，是纯运行时的，通过babel将jsx编译成jsx的方法执行从而生成ReactElement结构
//ReactElement如果作为核心模块操作的数据结构，存在的问题：无法表达节点之间的关系字段有限，不好拓展（比如：无法表达状态）
//需要一种新的数据结构介于ReactElement与真实UI节点之间,能够表达节点之间的关系,方便拓展（不仅作为数据存储单元，也能作为工作单元）
//这就是FiberNode（虚拟DOM在React中的实现）,vue中叫VNode
import { Props, Key, Ref, ReactElementType } from 'shared/ReactTypes';
import { FunctionComponent, HostComponent, WorkTag } from './workTags';
import { Flags, NoFlags } from './fiberFlags';
import { Container } from 'hostConfig';
export class FiberNode {
	type: any;
	tag: WorkTag;
	pendingProps: Props;
	key: Key;
	stateNode: any;
	ref: Ref;

	return: FiberNode | null;
	sibling: FiberNode | null;
	child: FiberNode | null;
	index: number;

	memoizedProps: Props | null;
	memoizedState: any;
	//用于在current和workinProgress间切换
	alternate: FiberNode | null;
	//标志表明在宿主环境中的操作，也称为副作用
	flags: Flags;
	subtreeFlags: Flags;
	updateQueue: unknown;
	deletions: FiberNode[] | null;

	constructor(tag: WorkTag, pendingProps: Props, key: Key) {
		this.tag = tag;
		this.key = key;
		this.ref = null;
		//对于div来说，该属性存储divDOM
		this.stateNode = null;
		//对于FunctionComponent来说，其type就是()=>{}
		this.type = null;
		//构成树状结构
		//表示节点关系，指向父FiberNode
		this.return = null;
		//指向兄弟FiberNode
		this.sibling = null;
		//指向子FiberNode
		this.child = null;
		//同级FiberNode的索引
		this.index = 0;

		//作为工作单元
		//初始状态
		this.pendingProps = pendingProps;
		//工作完后的状态
		this.memoizedProps = null;
		this.updateQueue = null;
		this.memoizedState = null;

		this.alternate = null;
		this.flags = NoFlags;
		this.subtreeFlags = NoFlags;
		this.deletions = null;
	}
}

//对于同一个节点，比较其ReactElement与fiberNode，生成子fiberNode。并根据比较的结果生成不同标记（插入、删除、移动......），对应不同宿主环境API的执行
//当所有ReactElement比较完后，会生成一棵fiberNode树，一共会存在两棵fiberNode树：
//current：与视图中真实UI对应的fiberNode树
//workInProgress：触发更新后，正在reconciler中计算的fiberNode树
//两棵树会进行替换，称为双缓冲技术
//以DFS顺序遍历ReactElement，先子后兄弟后父，递归遍历

//整个DOM的根节点Fiber
export class FiberRootNode {
	container: Container;
	//指向hostRootFiber，即rootElement的fiber
	current: FiberNode;
	//指向更新完成后的hostRootFiber
	finishedWork: FiberNode | null;
	constructor(container: Container, hostRootFiber: FiberNode) {
		this.container = container;
		this.current = hostRootFiber;
		//stateNode指向FiberRootNode
		hostRootFiber.stateNode = this;
		this.finishedWork = null;
	}
}

//由于FiberRootNode不能直接作为workInProgress,需要创建一个FiberNode
export const createWorkInProgress = (
	current: FiberNode,
	pendingProps: Props
): FiberNode => {
	//双缓冲机制，应该返回其对应的另一个FiberNode
	let wip = current.alternate;
	if (wip === null) {
		//mount 首屏渲染
		wip = new FiberNode(current.tag, pendingProps, current.key);
		wip.stateNode = current.stateNode;
		wip.alternate = current;
		current.alternate = wip;
	} else {
		//update
		wip.pendingProps = pendingProps;
		wip.flags = NoFlags;
		wip.subtreeFlags = NoFlags;
		wip.deletions = null;
	}
	wip.type = current.type;
	wip.updateQueue = current.updateQueue;
	wip.child = current.child;
	wip.memoizedProps = current.memoizedProps;
	wip.memoizedState = current.memoizedState;
	return wip;
};

export function createFiberFromElement(element: ReactElementType): FiberNode {
	const { type, key, props } = element;
	let fiberTag: WorkTag = FunctionComponent;
	if (typeof type === 'string') {
		fiberTag = HostComponent;
	} else if (typeof type !== 'function' && __DEV__) {
		console.warn('未定义的type类型', element);
	}
	const fiber = new FiberNode(fiberTag, props, key);
	fiber.type = type;
	return fiber;
}

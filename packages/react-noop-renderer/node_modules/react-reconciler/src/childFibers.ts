import { Props, ReactElementType } from 'shared/ReactTypes';
import {
	FiberNode,
	createFiberFromElement,
	createFiberFromFragment,
	createWorkInProgress
} from './fiber';
import { REACT_ELEMENT_TYPE, REACT_FRAGMENT_TYPE } from 'shared/ReactSymbols';
import { HostText } from './workTags';
import { ChildDeletion, Placement } from './fiberFlags';
import { Key } from 'shared/ReactTypes';
import { Fragment } from './workTags';

type ExisitingChildren = Map<string | number, FiberNode>;
function childReconciler(shouldTrackEffects: boolean) {
	function deleteChild(returnFiber: FiberNode, childToDelete: FiberNode) {
		if (!shouldTrackEffects) {
			return;
		}
		//保存父节点下所有需要被删除的子节点
		const deletions = returnFiber.deletions;
		if (deletions === null) {
			returnFiber.deletions = [childToDelete];
			returnFiber.flags |= ChildDeletion;
		} else {
			deletions.push(childToDelete);
		}
	}
	function deleteRemainingChildrem(
		returnFiber: FiberNode,
		currentFirstChild: FiberNode | null
	) {
		if (!shouldTrackEffects) {
			return;
		}
		let childToDelete = currentFirstChild;
		while (childToDelete !== null) {
			// 标记删除，并赋值为下一个兄弟
			deleteChild(returnFiber, childToDelete);
			childToDelete = childToDelete.sibling;
		}
	}
	function reconcileSingleElement(
		returnFiber: FiberNode,
		currentFiber: FiberNode | null,
		element: ReactElementType
	) {
		//判断节点能否复用，比较key和type
		const key = element.key;
		while (currentFiber !== null) {
			//update
			if (currentFiber.key === key) {
				//key相同
				if (element.$$typeof === REACT_ELEMENT_TYPE) {
					if (currentFiber.type === element.type) {
						let props = element.props;
						if (element.type === REACT_FRAGMENT_TYPE) {
							props = element.props.children;
						}
						//当前节点可以复用，标记剩下节点需删除
						const existing = useFiber(currentFiber, props);
						existing.return = returnFiber;
						deleteRemainingChildrem(returnFiber, currentFiber.sibling);
						return existing;
					}
					//key相同，type不同不能复用，删除所有旧节点
					deleteRemainingChildrem(returnFiber, currentFiber);
					break;
				} else {
					if (__DEV__) {
						console.warn('还未实现的react类型', element);
						break;
					}
				}
			} else {
				//删除旧节点，key不同，需要遍历其他兄弟
				deleteChild(returnFiber, currentFiber);
				currentFiber = currentFiber.sibling;
			}
		}
		//根据element,创建fiber
		let fiber;
		if (element.type === REACT_FRAGMENT_TYPE) {
			fiber = createFiberFromFragment(element.props.children, key);
		} else {
			fiber = createFiberFromElement(element);
		}
		fiber.return = returnFiber;
		return fiber;
	}
	function reconcileSingleTextNode(
		returnFiber: FiberNode,
		currentFiber: FiberNode | null,
		content: string | number
	) {
		while (currentFiber !== null) {
			//update
			if (currentFiber.tag === HostText) {
				//复用
				const existing = useFiber(currentFiber, { content });
				existing.return = returnFiber;
				deleteRemainingChildrem(returnFiber, currentFiber.sibling);
				return existing;
			}
			deleteChild(returnFiber, currentFiber);
			currentFiber = currentFiber.sibling;
		}
		const fiber = new FiberNode(HostText, { content }, null);
		fiber.return = returnFiber;
		return fiber;
	}
	function placeSingleChild(fiber: FiberNode) {
		if (shouldTrackEffects && fiber.alternate === null) {
			//首屏渲染
			fiber.flags |= Placement;
		}
		return fiber;
	}
	function reconcileChildrenArray(
		returnFiber: FiberNode,
		currentFirstChild: FiberNode | null,
		newChild: any[]
	) {
		let lastPlaceIndex: number = 0;
		//创建的最后一个fiber
		let lastNewFiber: FiberNode | null = null;
		//创建的第一个fiber
		let firstNewFiber: FiberNode | null = null;
		// 多节点复用，还需要支持node的移动
		//current 是更新前的fiber， newChild是当前jsx转换来打element
		//将current中所有同级fiber保存在Map中，遍历newChild数组，对于其中每个element，若在map中存在对应的fiber则复用，否则不能复用
		//复用是判断插入还是移动，最后Map中剩下的fiber都标记删除
		const existingChildren: ExisitingChildren = new Map();
		let current = currentFirstChild;
		while (current !== null) {
			const keyToUse = current.key !== null ? current.key : current.index;
			existingChildren.set(keyToUse, current);
			current = current.sibling;
		}
		//遍历newChild,判断是否可复用,标记插入还是移动
		for (let i = 0; i < newChild.length; i++) {
			const after = newChild[i];
			const newFiber = updateFromMap(returnFiber, existingChildren, i, after);
			if (newFiber === null) {
				continue;
			}
			//判断移动还是插入
			//判断element的index与对应的currentFiber的index是否相同
			//记录最后一个可复用fiber在current中的index为lastPlaceIndex
			//若接下来的遍历中可复用fiber的index < lastPlaceIndex,则标记Placement
			newFiber.index = i;
			newFiber.return = returnFiber;

			if (lastNewFiber === null) {
				lastNewFiber = newFiber;
				firstNewFiber = newFiber;
			} else {
				lastNewFiber.sibling = newFiber;
				lastNewFiber = lastNewFiber.sibling;
			}
			if (!shouldTrackEffects) {
				continue;
			}
			const current = newFiber.alternate;
			if (current !== null) {
				const oldIndex = current.index;
				if (oldIndex < lastPlaceIndex) {
					//移动
					newFiber.flags |= Placement;
					continue;
				} else {
					lastPlaceIndex = oldIndex;
				}
			} else {
				//插入
				newFiber.flags |= Placement;
			}
		}
		//标记删除Map中剩下的fiber
		existingChildren.forEach((fiber) => {
			deleteChild(returnFiber, fiber);
		});
		return firstNewFiber;
	}
	//判断是否可复用
	function updateFromMap(
		returnFiber: FiberNode,
		existingChildren: ExisitingChildren,
		index: number,
		element: any
	): FiberNode | null {
		const keyToUse = element.key !== null ? element.key : index;
		//更新前对应的fiber节点
		const before = existingChildren.get(keyToUse);

		if (typeof element === 'string' || typeof element === 'number') {
			//HostText
			if (before) {
				if (before.tag === HostText) {
					//可复用
					existingChildren.delete(keyToUse);
					return useFiber(before, { content: element + '' });
				}
			}
			return new FiberNode(HostText, { content: element + '' }, null);
		}
		//ReactElement
		if (typeof element === 'object' && element !== null) {
			switch (element.$$typeof) {
				case REACT_ELEMENT_TYPE:
					if (element.type === REACT_FRAGMENT_TYPE) {
						return updateFragment(
							returnFiber,
							before,
							element,
							keyToUse,
							existingChildren
						);
					}
					if (before) {
						if (before.type === element.type) {
							existingChildren.delete(keyToUse);
							return useFiber(before, element.props);
						}
					}
					return createFiberFromElement(element);
			}
			//TODO 数组类型
			if (Array.isArray(element) && __DEV__) {
				console.warn('还未实现数组类型的child');
			}
		}
		if (Array.isArray(element)) {
			return updateFragment(
				returnFiber,
				before,
				element,
				keyToUse,
				existingChildren
			);
		}
		return null;
	}
	return function reconcileChildFibers(
		returnFiber: FiberNode,
		currentFiber: FiberNode | null,
		newChild?: any
	) {
		//判断Fragment
		const isUnkeyedTopLevelFragment =
			typeof newChild === 'object' &&
			newChild !== null &&
			newChild.type === REACT_FRAGMENT_TYPE &&
			newChild.key === null;
		// Fragment包裹其他组件
		if (isUnkeyedTopLevelFragment) {
			//此时newChild是一个array
			newChild = newChild?.props.children;
		}
		//判断当前fiber的类型
		if (typeof newChild === 'object' && newChild !== null) {
			// 多节点情况
			if (Array.isArray(newChild)) {
				return reconcileChildrenArray(returnFiber, currentFiber, newChild);
			}
			switch (newChild.$$typeof) {
				case REACT_ELEMENT_TYPE:
					return placeSingleChild(
						reconcileSingleElement(returnFiber, currentFiber, newChild)
					);

				default:
					if (__DEV__) {
						console.warn('未实现的reconcile类型', newChild);
					}
					break;
			}
		}

		//HostText
		if (typeof newChild === 'string' || typeof newChild === 'number') {
			return placeSingleChild(
				reconcileSingleTextNode(returnFiber, currentFiber, newChild)
			);
		}
		if (currentFiber !== null) {
			//兜底删除
			deleteRemainingChildrem(returnFiber, currentFiber);
		}

		if (__DEV__) {
			console.warn('未实现的reconcile类型', newChild);
		}
		return null;
	};
}
//复用节点
function useFiber(fiber: FiberNode, pendingProps: Props): FiberNode {
	const clone = createWorkInProgress(fiber, pendingProps);
	clone.index = 0;
	clone.sibling = null;
	return clone;
}
function updateFragment(
	returnFiber: FiberNode,
	current: FiberNode | undefined,
	elements: any[],
	key: Key,
	existingChildren: ExisitingChildren
) {
	let fiber;
	if (!current || current.tag !== Fragment) {
		fiber = createFiberFromFragment(elements, key);
	} else {
		//复用fragment
		existingChildren.delete(key);
		fiber = useFiber(current, elements);
	}
	fiber.return = returnFiber;
	return fiber;
}
export const reconcilerChildFibers = childReconciler(true);
export const mountChildFibers = childReconciler(false);

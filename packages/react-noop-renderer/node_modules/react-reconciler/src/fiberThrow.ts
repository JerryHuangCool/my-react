import { Wakeable } from 'shared/ReactTypes';
import { FiberRootNode } from './fiber';
import { Lane, markRootPinged } from './fiberLanes';
import { ensureRootIsScheduled, markRootUpdated } from './workLoop';
import { getSuspenseHandler } from './suspenseContext';
import { ShouldCapture } from './fiberFlags';

export function throwException(root: FiberRootNode, value: any, lane: Lane) {
	//Error Boundray
	//thenable
	if (
		value !== null &&
		typeof value === 'object' &&
		typeof value.then === 'function'
	) {
		const wakeable: Wakeable<any> = value;

		//获取离当前fiber最近的suspense
		const suspenseBoundary = getSuspenseHandler();
		if (suspenseBoundary) {
			suspenseBoundary.flags |= ShouldCapture;
		}
		attachPingLister(root, wakeable, lane);
	}
}

function attachPingLister(
	root: FiberRootNode,
	wakeable: Wakeable<any>,
	lane: Lane
) {
	// 进行缓存, 只有第一次进入才触发更新
	let pingCache = root.pingCache;
	let threadIDs: Set<Lane> | undefined;

	if (pingCache === null) {
		threadIDs = new Set<Lane>();
		pingCache = root.pingCache = new WeakMap<Wakeable<any>, Set<Lane>>();
		pingCache.set(wakeable, threadIDs);
	} else {
		threadIDs = pingCache.get(wakeable);
		if (threadIDs === undefined) {
			threadIDs = new Set<Lane>();
			pingCache.set(wakeable, threadIDs);
		}
	}
	function ping() {
		//触发更新
		console.warn('ping!!');

		if (pingCache !== null) {
			pingCache.delete(wakeable);
		}
		markRootPinged(root, lane);
		markRootUpdated(root, lane);
		ensureRootIsScheduled(root);
	}
	if (!threadIDs.has(lane)) {
		threadIDs.add(lane);
		wakeable.then(ping, ping);
	}
}

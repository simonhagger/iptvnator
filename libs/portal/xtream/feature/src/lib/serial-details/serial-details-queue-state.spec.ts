import { SerialDetailsQueueState } from './serial-details-queue-state';

describe('SerialDetailsQueueState', () => {
    it('keeps the selected sequence through its first confirmed launch', () => {
        const state = new SerialDetailsQueueState();
        const ids = [1001, 1002];
        state.seed(ids, 1001);
        ids.push(2001);
        const request = state.requested(1001);
        state.settle(request, 'confirmed');
        expect(state.initial()).toEqual([1001, 1002]);
        expect(state.launch()?.phase).toBe('confirmed');

        state.requested(1002);
        expect(state.initial()).toBeNull();
    });

    it('drops a pending seed when a different episode is chosen', () => {
        const state = new SerialDetailsQueueState();
        state.seed([1001, 1002], 1001);
        state.requested(1001);
        const replacement = state.requested(2001);
        expect(state.initial()).toBeNull();
        state.settle(replacement, 'confirmed');
        expect(state.launch()?.phase).toBe('confirmed');
    });

    it('ignores older launch completion while its replacement is pending', () => {
        const state = new SerialDetailsQueueState();
        const older = state.requested(1001);
        const newer = state.requested(1002);
        state.settle(older, 'failed');
        expect(state.launch()).toEqual({ revision: newer, phase: 'requested' });
        state.settle(newer, 'confirmed');
        expect(state.launch()?.phase).toBe('confirmed');
    });

    it('allows retry after failure and ignores completion from a closed visit', () => {
        const state = new SerialDetailsQueueState();
        state.seed([1001, 1002], 1001);
        const failed = state.requested(1001);
        state.settle(failed, 'failed');
        expect(state.initial()).toBeNull();
        const retry = state.requested(1001);
        state.reset();
        const reopened = state.requested(1001);
        state.settle(retry, 'confirmed');
        expect(state.launch()).toEqual({
            revision: reopened,
            phase: 'requested',
        });
    });
});

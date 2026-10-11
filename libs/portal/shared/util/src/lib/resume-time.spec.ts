import { formatResumeTime } from './resume-time';

describe('resume timestamp', () => {
    it.each([
        [42, '00:42'],
        [3723, '01:02:03'],
        [90061, '25:01:01'],
        [-1, '00:00'],
        [NaN, '00:00'],
    ])('formats %s', (seconds, expected) => {
        expect(formatResumeTime(seconds as number)).toBe(expected);
    });
});

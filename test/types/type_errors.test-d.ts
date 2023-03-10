import { MongoClient } from '../../src/index';

/**
 * This test file should contain examples of known compilation errors
 * using the `@ts-expect-error` directive above a failing line will make it succeed to compile
 * and it will catch the case where something stops being a compilation error.
 *
 * You should attempt to accompany any "failing" example with a succeeding one since `@ts-expect-error`
 * will ignore any and all errors generated by the line beneath it.
 */

const db = new MongoClient('').db();
const pets = db.collection<{ type: string; age: number }>('pets');

const dogs = pets.find({ type: 'dog' });

// NODE-3468 generic parameters were removed from these cursor methods
// using the generic accepting methods: `.project` `.map` `.find`
// is the preferred way to strongly type your cursor result

// @ts-expect-error
await dogs.toArray<{ age: number }>();
await dogs.toArray();
// @ts-expect-error
await dogs.forEach<{ age: number }>(() => {});
await dogs.forEach(() => {});
// @ts-expect-error
await dogs.next<{ age: number }>();
await dogs.next();

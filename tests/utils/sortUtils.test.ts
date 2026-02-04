import { describe, expect, it } from 'vitest';
import { sortFiles } from '../../src/utils/sortUtils';
import { createTestTFile } from './createTestTFile';

describe('sortFiles', () => {
    it('sorts by file name (A on top / Z on top)', () => {
        const files = [
            createTestTFile('z/file10.md'),
            createTestTFile('z/file2.md'),
            createTestTFile('z/file1.md'),
            createTestTFile('z/file001.md')
        ];

        sortFiles(
            files,
            'filename-asc',
            () => 0,
            () => 0
        );
        expect(files.map(file => file.basename)).toEqual(['file1', 'file001', 'file2', 'file10']);

        sortFiles(
            files,
            'filename-desc',
            () => 0,
            () => 0
        );
        expect(files.map(file => file.basename)).toEqual(['file10', 'file2', 'file1', 'file001']);
    });

    it('uses path as a deterministic tie-breaker', () => {
        const files = [createTestTFile('b/dup.md'), createTestTFile('a/dup.md')];

        sortFiles(
            files,
            'filename-asc',
            () => 0,
            () => 0
        );

        expect(files.map(file => file.path)).toEqual(['a/dup.md', 'b/dup.md']);
    });

    it('sorts by property then title (A on top)', () => {
        const propertyValueByPath = new Map<string, string | null>([
            ['z/with-b.md', 'b'],
            ['z/with-a.md', 'a'],
            ['z/with-a2.md', 'a'],
            ['z/missing-z.md', null],
            ['z/missing-m.md', null]
        ]);

        const files = [
            createTestTFile('z/missing-z.md'),
            createTestTFile('z/with-b.md'),
            createTestTFile('z/missing-m.md'),
            createTestTFile('z/with-a2.md'),
            createTestTFile('z/with-a.md')
        ];

        sortFiles(
            files,
            'property-asc',
            () => 0,
            () => 0,
            file => file.basename,
            file => propertyValueByPath.get(file.path) ?? null
        );

        expect(files.map(file => file.basename)).toEqual(['with-a', 'with-a2', 'with-b', 'missing-m', 'missing-z']);
    });

    it('sorts property values using natural comparison', () => {
        const propertyValueByPath = new Map<string, string | null>([
            ['z/with-10.md', '10'],
            ['z/with-2.md', '2'],
            ['z/with-1.md', '1']
        ]);

        const files = [createTestTFile('z/with-10.md'), createTestTFile('z/with-2.md'), createTestTFile('z/with-1.md')];

        sortFiles(
            files,
            'property-asc',
            () => 0,
            () => 0,
            file => file.basename,
            file => propertyValueByPath.get(file.path) ?? null
        );
        expect(files.map(file => file.basename)).toEqual(['with-1', 'with-2', 'with-10']);

        sortFiles(
            files,
            'property-desc',
            () => 0,
            () => 0,
            file => file.basename,
            file => propertyValueByPath.get(file.path) ?? null
        );
        expect(files.map(file => file.basename)).toEqual(['with-10', 'with-2', 'with-1']);
    });

    it('sorts by property then title (Z on top)', () => {
        const propertyValueByPath = new Map<string, string | null>([
            ['z/with-b.md', 'b'],
            ['z/with-a.md', 'a'],
            ['z/missing-a.md', null],
            ['z/missing-z.md', null]
        ]);

        const files = [
            createTestTFile('z/missing-a.md'),
            createTestTFile('z/with-a.md'),
            createTestTFile('z/missing-z.md'),
            createTestTFile('z/with-b.md')
        ];

        sortFiles(
            files,
            'property-desc',
            () => 0,
            () => 0,
            file => file.basename,
            file => propertyValueByPath.get(file.path) ?? null
        );

        expect(files.map(file => file.basename)).toEqual(['with-b', 'with-a', 'missing-z', 'missing-a']);
    });
});

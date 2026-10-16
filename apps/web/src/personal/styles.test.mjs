import {test,expect} from 'bun:test';
import {DIAGRAM_SELECTABLE_STRUCTURES,DIAGRAM_SELECTABLE_THEMES,resolveDiagramTheme,resolveDiagramStructure} from '@edgeever/shared';
import {restructure,thumbnailDocument} from './styles';
test('all thirteen structures produce finite distinct layout families without changing content',()=>{
 const original=structuredClone(thumbnailDocument),layouts=new Set();
 for(const structure of DIAGRAM_SELECTABLE_STRUCTURES){const next=restructure(original,structure);expect(next.nodes.map(n=>n.label)).toEqual(original.nodes.map(n=>n.label));expect(next.edges).toEqual(original.edges);expect(next.nodes.every(n=>[n.x,n.y,n.width,n.height].every(Number.isFinite))).toBe(true);layouts.add(JSON.stringify(next.nodes.map(n=>[n.x,n.y])));}
 expect(layouts.size).toBeGreaterThanOrEqual(7);expect(thumbnailDocument).toEqual(original);
});
test('new themes extend all original presets without changing historical aliases',()=>{
 expect(DIAGRAM_SELECTABLE_THEMES.slice(0,11)).toEqual(['plain','brand','cosmos','dune','slate','prism','sunrise','marine','blossom','mint','macaron']);expect(resolveDiagramTheme('paper')).toBe('brand');expect(resolveDiagramTheme('classic')).toBe('sunrise');expect(resolveDiagramStructure('rect')).toBe('map');
});

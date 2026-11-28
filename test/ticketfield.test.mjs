// Min resa med "Planerar från din biljett": rutan för tåg- eller flightnumret ska synas direkt,
// även innan målet är skrivet. Den försvann en gång (bara "Vart ska du?" syntes), aldrig igen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./support/tsx-loader.mjs', import.meta.url);

const React = (await import('react')).default;
const { renderToStaticMarkup } = await import('react-dom/server');
const { default: JourneyPlan } = await import('../components/JourneyPlan.tsx');

function render(props) {
  return renderToStaticMarkup(
    React.createElement(JourneyPlan, {
      goal: '',
      place: null,
      onPlace: () => {},
      onClear: () => {},
      onSave: () => {},
      fromId: '',
      fromName: '',
      startAt: null,
      savedKey: '',
      ...props,
    })
  );
}

test('biljettläge utan mål: rutan för numret syns', () => {
  const html = render({ ticket: true, goal: '' });
  assert.match(html, /id="biljett-nummer"/);
  assert.match(html, /Tågnummer eller flightnummer/);
  assert.match(html, /Din biljett/);
  // Resten (Från, Sök resa) väntar tills målet är skrivet.
  assert.doesNotMatch(html, /id="sok-resa"/);
});

test('biljettläge med mål: både rutan och Sök resa syns', () => {
  const html = render({ ticket: true, goal: 'Härnösand' });
  assert.match(html, /id="biljett-nummer"/);
  assert.match(html, /id="sok-resa"/);
});

test('utan biljett och utan mål: ingenting, och ingen biljettruta med mål', () => {
  assert.equal(render({ ticket: false, goal: '' }), '');
  assert.doesNotMatch(render({ ticket: false, goal: 'Härnösand' }), /id="biljett-nummer"/);
});

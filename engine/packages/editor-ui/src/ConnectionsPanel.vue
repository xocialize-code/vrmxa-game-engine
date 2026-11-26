<script setup>
// A node's outgoing connections in the inspector (M6 W1, AB-T-0638): each is four picks from lists, none typed: the
// signal (the node's type's and its behaviours'), the target (a node of the scene), the action (the target's) and its
// arguments (fields by the action's schema). A new one is made from the first three. The app turns each event into one
// undo step (EditorSession connect, setConnection, setConnectionArg, disconnect). Connections into the node are listed.
// A control's accessible name stays the same while the picks change (an automation's reference to it stays good).
import { computed, ref, watch } from 'vue';
import FieldRows from './FieldRows.vue';
import { retarget } from './wiring-ui.js';

const props = defineProps({
  /** wiring-ui.js wiringView's data. */
  wiring: { type: Object, required: true },
  /** Node ids, for node arguments. */
  nodes: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
});
const emit = defineEmits(['connect', 'set', 'arg', 'disconnect', 'gesture']);
const signal = ref(''), to = ref(''), call = ref('');
const draftActions = computed(() => props.wiring.actions[to.value] ?? []);
function pickTo(v) { to.value = v; if (!draftActions.value.some((a) => a.name === call.value)) call.value = ''; }
function connect() {
  if (!signal.value || !to.value || !call.value) return;
  emit('connect', { signal: signal.value, to: to.value, call: call.value });
  signal.value = ''; to.value = ''; call.value = '';
}
// a connection whose new target hasn't its action: the target held here until one of its actions is picked
const pending = ref({});
watch(() => props.wiring.id, () => { pending.value = {}; }); // another node: nothing held
function pickTarget(c, to) {
  const r = retarget(props.wiring, c, to);
  const { [c.index]: _, ...rest } = pending.value;
  pending.value = 'pending' in r ? { ...rest, [c.index]: r.pending } : rest;
  if ('set' in r) emit('set', c.index, r.set);
}
function pickAction(c, call) {
  const to = pending.value[c.index];
  if (to === undefined) { emit('set', c.index, { call }); return; }
  if (!call) return;
  const { [c.index]: _, ...rest } = pending.value;
  pending.value = rest;
  emit('set', c.index, { to, call });
}
const targetOf = (c) => pending.value[c.index] ?? c.to;
const cid = (c) => `conn-${c.index}`;
const said = (c) => `${props.wiring.id}.${c.signal} → ${c.to}.${c.call}`;
</script>

<template>
  <section id="connections" class="wiring" :aria-label="`Connections from ${wiring.id}: ${wiring.connections.length}`">
    <h3>Connections</h3>
    <p v-if="!wiring.connections.length" class="muted small">None. A connection calls another node's action when this one sends a signal.</p>
    <div v-for="c in wiring.connections" :id="cid(c)" :key="c.index" class="wiring-item" :class="{ broken: c.problem }" role="group" :aria-label="`Connection ${c.index + 1}: ${said(c)}${c.problem ? `; ${c.problem}` : ''}`">
      <div class="insp-row">
        <span class="insp-key">Signal</span>
        <select :id="`${cid(c)}-signal`" :value="c.signal" :aria-label="`Connection ${c.index + 1} signal`" :disabled="disabled" @change="emit('set', c.index, { signal: $event.target.value })">
          <option v-if="!wiring.signals.some((s) => s.name === c.signal)" :value="c.signal">{{ c.signal }} (missing)</option>
          <option v-for="s in wiring.signals" :key="s.name" :value="s.name" :title="s.description">{{ s.name }}</option>
        </select>
        <button :id="`${cid(c)}--remove`" type="button" class="vf-tool" :aria-label="`Remove connection ${c.index + 1}`" :disabled="disabled" @click="emit('disconnect', c.index)">×</button>
      </div>
      <div class="insp-row">
        <span class="insp-key">Target</span>
        <select :id="`${cid(c)}-to`" :value="targetOf(c)" :aria-label="`Connection ${c.index + 1} target`" :disabled="disabled" @change="pickTarget(c, $event.target.value)">
          <option v-if="!wiring.targets.includes(c.to)" :value="c.to">{{ c.to }}</option>
          <option v-for="n in wiring.targets" :key="n" :value="n">{{ n }}</option>
        </select>
      </div>
      <div class="insp-row">
        <span class="insp-key">Action</span>
        <select :id="`${cid(c)}-call`" :value="pending[c.index] !== undefined ? '' : c.call" :aria-label="`Connection ${c.index + 1} action`" :disabled="disabled" @change="pickAction(c, $event.target.value)">
          <option v-if="pending[c.index] !== undefined" value="">Action…</option>
          <option v-else-if="!(wiring.actions[c.to] ?? []).some((a) => a.name === c.call)" :value="c.call">{{ c.call }} (missing)</option>
          <option v-for="a in wiring.actions[targetOf(c)] ?? []" :key="a.name" :value="a.name" :title="a.description">{{ a.name }}</option>
        </select>
      </div>
      <p v-if="pending[c.index] !== undefined" :id="`${cid(c)}-pending`" class="small muted" role="status">{{ pending[c.index] }} has no action {{ c.call }}: pick one of its actions to move the connection there.</p>
      <p v-if="c.problem" :id="`${cid(c)}-problem`" class="small slot-why" role="status">{{ c.problem }}</p>
      <FieldRows v-if="pending[c.index] === undefined" :fields="c.fields" :id-base="`${cid(c)}-arg`" :owner="c.call" :nodes="nodes" :disabled="disabled" @change="(k, v) => emit('arg', c.index, k, v)" @gesture="emit('gesture', $event)" />
    </div>
    <div class="wiring-item wiring-new" role="group" aria-label="New connection">
      <div class="insp-row">
        <span class="insp-key">Signal</span>
        <select id="conn-new-signal" v-model="signal" aria-label="New connection signal" :disabled="disabled || !wiring.signals.length">
          <option value="">Signal…</option>
          <option v-for="s in wiring.signals" :key="s.name" :value="s.name" :title="`${s.description} (${s.from})`">{{ s.name }}</option>
        </select>
      </div>
      <div class="insp-row">
        <span class="insp-key">Target</span>
        <select id="conn-new-to" :value="to" aria-label="New connection target" :disabled="disabled" @change="pickTo($event.target.value)">
          <option value="">Target…</option>
          <option v-for="n in wiring.targets" :key="n" :value="n">{{ n }}</option>
        </select>
      </div>
      <div class="insp-row">
        <span class="insp-key">Action</span>
        <select id="conn-new-call" v-model="call" aria-label="New connection action" :disabled="disabled || !to">
          <option value="">Action…</option>
          <option v-for="a in draftActions" :key="a.name" :value="a.name" :title="a.description">{{ a.name }}</option>
        </select>
      </div>
      <div class="insp-row wiring-go">
        <button id="conn-new-add" type="button" aria-label="Connect the picked signal, target and action" :title="signal && to && call ? `Connect ${wiring.id}.${signal} to ${to}.${call}` : 'Pick a signal, a target and an action first'" :disabled="disabled || !signal || !to || !call" @click="connect">Connect</button>
      </div>
    </div>
    <p v-if="wiring.incoming.length" id="connections-in" class="muted small" :aria-label="`Connections into ${wiring.id}: ${wiring.incoming.map((c) => `${c.from}.${c.signal} calls ${c.call}`).join('; ')}`">
      Into it: {{ wiring.incoming.map((c) => `${c.from}.${c.signal} → ${c.call}`).join(', ') }}
    </p>
  </section>
</template>

<style>
.wiring { margin-top: 12px; border-top: 1px solid var(--line, #3335); }
.wiring-item { margin: 6px 0; padding: 4px 6px; border: 1px solid var(--line, #3335); border-radius: 6px; }
.wiring-item.broken { border-color: #c0392b; }
.wiring-new { border-style: dashed; }
.wiring-head strong { flex: 1 1 auto; }
.wiring-go { justify-content: flex-end; }
.wiring .insp-row > select { flex: 0 1 160px; max-width: 62%; min-width: 0; }
</style>

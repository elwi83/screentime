import { deduction, stockholmDay, usedSlots } from './domain';
import type { Profile, Rule, ScreenKind, Snapshot } from './types';

export const taskTemplates = [
  { title: 'Läsning', reward: 30, daily_limit: 3, descriptions: ['10 min, höstlovs läsbingo.', '15 min.'] },
  { title: 'Skrivning', reward: 60, daily_limit: 3, descriptions: ['3 meningar. Fint skrivna med stor bokstav, mellanrum och punkt. Minst 4 ord per mening.', '10 meningar (fokus beskrivande och rättstavning).'] },
  { title: 'Matte', reward: 30, daily_limit: 3, descriptions: ['Öva uppställning, 5 tal/uppställningar fint uppställda och uträknade.', 'Öva inför prov i Magma eller på papper, 15 min.'] },
  { title: 'Utomhus', reward: 30, daily_limit: 12, descriptions: ['Skärmpaus, vara utomhus i 30 min i sträck (toabesök eller hämta nått snabbt inne är ok).', 'Skärmpaus, vara utomhus i 30 min i sträck (toabesök eller hämta nått snabbt inne är ok).'] },
  { title: 'Inomhus', reward: 30, daily_limit: 6, descriptions: ['Skärmpaus inomhus 60 min i sträck (TV = skärm).', 'Skärmpaus inomhus 60 min i sträck (TV = skärm).'] },
];

export class Demo {
  data: Snapshot = {
    profiles: [
      { id: 'parent', name: 'Förälder', role: 'parent', balance: 0 },
      { id: 'maximilian', name: 'Maximilian', role: 'child', balance: 0 },
      { id: 'walter', name: 'Walter', role: 'child', balance: 0 },
    ],
    rules: taskTemplates.flatMap((task, index) => ['maximilian', 'walter'].map((child, childIndex) => ({
      id: `${child}-${index}`, child_id: child, title: task.title, description: task.descriptions[childIndex],
      reward: task.reward, daily_limit: task.daily_limit, sort_order: index,
    }))),
    requests: [], entries: [],
  };

  submit(user: Profile, ruleId: string, note: string) {
    const rule = this.data.rules.find(r => r.id === ruleId && r.child_id === user.id);
    if (user.role !== 'child' || !rule) throw new Error('Uppgiften kunde inte hittas.');
    if (usedSlots(this.data, ruleId) >= rule.daily_limit) throw new Error('Du har nått dagens gräns för uppgiften.');
    if (note.length > 500) throw new Error('Anteckningen får vara högst 500 tecken.');
    this.data.requests.unshift({
      id: crypto.randomUUID(), child_id: user.id, rule_id: rule.id, title: rule.title,
      reward: rule.reward, note, status: 'pending', task_day: stockholmDay(),
      created_at: new Date().toISOString(), reviewed_at: null,
    });
  }

  review(user: Profile, id: string, approve: boolean) {
    this.parent(user);
    const request = this.data.requests.find(r => r.id === id);
    if (!request || request.status !== 'pending') throw new Error('Förfrågan är redan hanterad.');
    request.status = approve ? 'approved' : 'rejected';
    request.reviewed_at = new Date().toISOString();
    if (approve) this.entry(request.child_id, request.reward, request.title);
  }

  deduct(user: Profile, child: string, minutes: number, kind: ScreenKind) {
    this.parent(user);
    const cost = deduction(minutes, kind);
    const profile = this.data.profiles.find(p => p.id === child && p.role === 'child');
    if (!profile) throw new Error('Barnet kunde inte hittas.');
    if (profile.balance < cost) throw new Error('Det finns inte tillräckligt med skärmtid.');
    this.entry(child, -cost, `${kind === 'youtube' ? 'YouTube' : 'Skärmtid'}: ${minutes} min${kind === 'youtube' ? ' × 2' : ''}`);
  }

  edit(user: Profile, ruleId: string, values: Pick<Rule, 'description' | 'reward' | 'daily_limit'>) {
    this.parent(user);
    const rule = this.data.rules.find(r => r.id === ruleId);
    if (!rule) throw new Error('Regeln kunde inte hittas.');
    if (!values.description.trim() || values.description.length > 2000 ||
        !Number.isInteger(values.reward) || values.reward < 1 || values.reward > 10000 ||
        !Number.isInteger(values.daily_limit) || values.daily_limit < 1 || values.daily_limit > 100) {
      throw new Error('Kontrollera beskrivning, belöning (1–10 000) och dagsgräns (1–100).');
    }
    Object.assign(rule, values);
  }

  private parent(user: Profile) {
    if (user.role !== 'parent') throw new Error('Bara föräldrar kan göra detta.');
  }

  private entry(child: string, amount: number, reason: string) {
    const profile = this.data.profiles.find(p => p.id === child)!;
    profile.balance += amount;
    this.data.entries.unshift({ id: crypto.randomUUID(), child_id: child, amount, reason, created_at: new Date().toISOString() });
  }
}

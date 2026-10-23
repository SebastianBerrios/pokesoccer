import { describe, expect, it } from 'vitest';
import { AudioEventCursor, parseAudioPreferences } from '../apps/client/src/audio.ts';
import { Game } from '../packages/game/src/engine.ts';
import { event } from '../packages/game/src/state.ts';

describe('audio preferences and snapshot cursor',()=>{
  it('validates stored volumes and preserves mute',()=>{
    expect(parseAudioPreferences(null)).toEqual({muted:true,music:.35,voices:.75,effects:.55});
    expect(parseAudioPreferences('{')).toEqual(parseAudioPreferences(null));
    expect(parseAudioPreferences('{"music":4,"voices":-1,"effects":"bad","muted":false}')).toEqual({muted:false,music:1,voices:0,effects:.55});
  });
  it('does not replay initial history, repeated snapshots or reconnect history',()=>{
    const s=new Game().state,cursor=new AudioEventCursor();event(s,'cast','old');
    expect(cursor.consume(s)).toEqual([]);event(s,'ability','new');
    expect(cursor.consume(s)).toHaveLength(1);expect(cursor.consume(structuredClone(s))).toEqual([]);
    cursor.reset();expect(cursor.consume(s)).toEqual([]);event(s,'ability','after reconnect');expect(cursor.consume(s)).toHaveLength(1);
  });
});

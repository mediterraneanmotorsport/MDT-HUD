import type { Component } from "svelte";
import type { Units } from "../../lib/config.svelte";
import Damage from "./Damage.svelte";
import Dashboard from "./Dashboard.svelte";
import Delta from "./Delta.svelte";
import Electronics from "./Electronics.svelte";
import Flags from "./Flags.svelte";
import Fuel from "./Fuel.svelte";
import Inputs from "./Inputs.svelte";
import LapTiming from "./LapTiming.svelte";
import LiftCoast from "./LiftCoast.svelte";
import MdtBranding from "./MdtBranding.svelte";
import MfdWidget from "./MfdWidget.svelte";
import PaceCatch from "./PaceCatch.svelte";
import Radar from "./Radar.svelte";
import Relative from "./Relative.svelte";
import SessionInfo from "./SessionInfo.svelte";
import ShiftLights from "./ShiftLights.svelte";
import Standings from "./Standings.svelte";
import StintPlanner from "./StintPlanner.svelte";
import TrackLimits from "./TrackLimits.svelte";
import TrackMap from "./TrackMap.svelte";
import Tyres from "./Tyres.svelte";
import Weather from "./Weather.svelte";
import BattleForPos from "./BattleForPos.svelte";
import BroadcastTicker from "./BroadcastTicker.svelte";
import SpotterWidget from "./SpotterWidget.svelte";
import PitRejoin from "./PitRejoin.svelte";
import MulticlassTraffic from "./MulticlassTraffic.svelte";
import BrakeLockup from "./BrakeLockup.svelte";
import StintPace from "./StintPace.svelte";
import DriverLowerThird from "./DriverLowerThird.svelte";
import HeadToHead from "./HeadToHead.svelte";
import GridPodium from "./GridPodium.svelte";
import CustomDashWidget from "./CustomDashWidget.svelte";
import PitBoxMeter from "./PitBoxMeter.svelte";
import LiveTraceGhost from "./LiveTraceGhost.svelte";

export interface WidgetProps {
  opts: Record<string, any>;
  units: Units;
  edit: boolean;
}

/** Widget id (see WIDGETS in config.svelte.ts) -> component. */
export const COMPONENTS: Record<string, Component<WidgetProps>> = {
  dashboard: Dashboard,
  inputs: Inputs,
  delta: Delta,
  laptiming: LapTiming,
  standings: Standings,
  relative: Relative,
  pacecatch: PaceCatch,
  shiftlights: ShiftLights,
  radar: Radar,
  fuel: Fuel,
  tyres: Tyres,
  session: SessionInfo,
  flags: Flags,
  tracklimits: TrackLimits,
  liftcoast: LiftCoast,
  trackmap: TrackMap,
  weather: Weather,
  damage: Damage,
  electronics: Electronics,
  mdtbranding: MdtBranding,
  mfd: MfdWidget,
  stintplanner: StintPlanner,
  battleforpos: BattleForPos,
  broadcastticker: BroadcastTicker,
  spotter: SpotterWidget,
  pitrejoin: PitRejoin,
  multiclasstraffic: MulticlassTraffic,
  brakelockup: BrakeLockup,
  stintpace: StintPace,
  driverlowerthird: DriverLowerThird,
  headtohead: HeadToHead,
  gridpodium: GridPodium,
  customdash: CustomDashWidget,
  pitbox: PitBoxMeter,
  liveghost: LiveTraceGhost,
};

"""
Record ONE controller for the dashboard: pictures from sumo-gui + a metrics CSV.

    python traci9_record.py fixed      # fixed-timing signal (baseline)
    python traci9_record.py ql         # trained Q-learning agent   (needs q_table.pkl)
    python traci9_record.py dqn        # trained DQN agent          (needs dqn_traffic.keras)

Options:
    --steps=1000     run fewer steps (quick test; default is TOTAL_STEPS below)
    --no-frames      metrics only: plain sumo, no window, no pictures (fast)

The agents only ACT here: no exploration (epsilon = 0) and no learning.
Every controller uses the same SEED, so all three see the same traffic.
Output goes to recordings/<controller>/ (frames/, metrics.csv, meta.json).
Afterwards run:  python build_dashboard.py
"""
import os
import sys
import csv
import json
import shutil
import pickle
import numpy as np

# -------------------------
# Settings
# -------------------------
TOTAL_STEPS = 10000          # 10000 steps x 0.1 s = 1000 simulated seconds
STEP_LENGTH = 0.1
SEED = 42                    # same seed for every controller = same traffic
FRAME_EVERY = 5              # one picture every 5 steps (= 0.5 simulated seconds)
FRAME_SIZE = (960, 1200)     # width, height of each picture in pixels (keep the 4:5 shape)
# Part of the network to show, in SUMO coordinates (xmin, ymin, xmax, ymax). It is the junction and
# about 75 m of each arm, so the cars look 2-3 times bigger than when the whole network is shown.
# Use None to show the whole network. Keep the 4:5 shape (width : height = 130 : 162).
VIEW_BOX = (-63, -85, 67, 77)
FRAME_FORMAT = "jpg"         # "jpg" = small files. Use "png" if your SUMO cannot save jpg.
VIDEO_FPS = 20               # 2000 pictures / 20 fps = a 100 s video (10x faster than real time)

DETECTORS = ["det_NW_0", "det_NW_1",
             "det_NE_0", "det_NE_1",
             "det_SW_0", "det_SW_1",
             "det_SE_0", "det_SE_1"]
TLS_ID = "Node2"
GREEN_PHASES = [0, 3]        # 0 = road B green, 3 = road A green (1,4 = yellow; 2,5 = all red)
MIN_GREEN_STEPS = 140        # same rule as in the training scripts
NAMES = {"fixed": "Fixed timing", "ql": "Q-learning", "dqn": "Deep Q-learning (DQN)"}

# -------------------------
# Read the command line
# -------------------------
words = [a for a in sys.argv[1:] if not a.startswith("--")]
if not words or words[0] not in NAMES:
    sys.exit(__doc__)
CONTROLLER = words[0]
NO_FRAMES = "--no-frames" in sys.argv
for a in sys.argv[1:]:
    if a.startswith("--steps="):
        TOTAL_STEPS = int(a.split("=", 1)[1])

# -------------------------
# SUMO / TraCI
# -------------------------
if 'SUMO_HOME' in os.environ:
    sys.path.append(os.path.join(os.environ['SUMO_HOME'], 'tools'))
else:
    sys.exit("Please declare environment variable 'SUMO_HOME'")
import traci

# -------------------------
# Load the trained brain (if the controller needs one)
# -------------------------
Q_table = {}
dqn_model = None
if CONTROLLER == "ql":
    if not os.path.exists("q_table.pkl"):
        sys.exit("q_table.pkl not found. Run traci6_QL.py first (it saves the table at the end).")
    with open("q_table.pkl", "rb") as f:
        Q_table = pickle.load(f)
    print("Loaded Q-table with", len(Q_table), "states")
elif CONTROLLER == "dqn":
    if not os.path.exists("dqn_traffic.keras"):
        sys.exit("dqn_traffic.keras not found. Run traci7_DQL.py first (it saves the model).")
    from tensorflow import keras
    dqn_model = keras.models.load_model("dqn_traffic.keras")
    print("Loaded DQN model")


def discretize(state):
    """Same grouping as in traci6_QL.py: 0 cars, 1-2 cars, 3+ cars."""
    levels = tuple(0 if c == 0 else (1 if c <= 2 else 2) for c in state[:-1])
    return levels + (state[-1],)


def to_array(state_tuple):
    return np.array(state_tuple, dtype=np.float32).reshape((1, -1))


# -------------------------
# Output folders
# -------------------------
out_dir = os.path.join("recordings", CONTROLLER)
frames_dir = os.path.join(out_dir, "frames")
if os.path.isdir(out_dir):
    shutil.rmtree(out_dir)          # start clean so old pictures never mix with new ones
os.makedirs(frames_dir)

# -------------------------
# Start SUMO
# -------------------------
Sumo_config = [
    'sumo' if NO_FRAMES else 'sumo-gui',
    '-c', 'RL.sumocfg',
    '--step-length', str(STEP_LENGTH),
    '--seed', str(SEED),
    '--lateral-resolution', '0',
]
if not NO_FRAMES:
    Sumo_config += ['--gui-settings-file', 'RL.view.xml', '--delay', '0']
traci.start(Sumo_config)
if not NO_FRAMES:
    traci.gui.setSchema("View #0", "real world")
    if VIEW_BOX:
        try:
            traci.gui.setBoundary("View #0", *VIEW_BOX)
        except Exception as e:
            print("Could not zoom the view (", e, ") - the whole network will be shown.")


# -------------------------
# Helper functions
# -------------------------
def get_state():
    queues = tuple(traci.lanearea.getLastStepVehicleNumber(d) for d in DETECTORS)
    return queues + (traci.trafficlight.getPhase(TLS_ID),)


def choose_action(state):
    """0 = keep phase, 1 = switch phase. No exploration, no learning."""
    if CONTROLLER == "fixed":
        return 0
    if CONTROLLER == "ql":
        q = Q_table.get(discretize(state))
        if q is None:
            return 0                # a state never seen in training: keep the phase
        return int(np.argmax(q))
    q = dqn_model(to_array(state), training=False).numpy()[0]
    return int(np.argmax(q))


last_switch_step = -MIN_GREEN_STEPS


def apply_action(action, step):
    """Same rules as in the training scripts. Returns the action really carried out."""
    global last_switch_step
    if action == 0:
        return 0
    phase = traci.trafficlight.getPhase(TLS_ID)
    if phase in GREEN_PHASES and step - last_switch_step >= MIN_GREEN_STEPS:
        num_phases = len(traci.trafficlight.getAllProgramLogics(TLS_ID)[0].phases)
        traci.trafficlight.setPhase(TLS_ID, (phase + 1) % num_phases)
        last_switch_step = step
        return 1
    return 0


# -------------------------
# Run
# -------------------------
def write_meta(steps_done, frames):
    """Written at the start AND at the end (even after Ctrl+C or an error), so build_dashboard.py can always read it."""
    with open(os.path.join(out_dir, "meta.json"), "w") as f:
        json.dump({"controller": CONTROLLER, "name": NAMES[CONTROLLER], "steps": steps_done,
                   "step_length": STEP_LENGTH, "frame_every": FRAME_EVERY, "frames": frames,
                   "frame_ext": FRAME_FORMAT, "fps": VIDEO_FPS, "seed": SEED}, f, indent=2)


print(f"Recording '{NAMES[CONTROLLER]}' for {TOTAL_STEPS} steps "
      f"({TOTAL_STEPS * STEP_LENGTH:.0f} simulated seconds) ...")
write_meta(0, 0)
csv_file = open(os.path.join(out_dir, "metrics.csv"), "w", newline="")
writer = csv.writer(csv_file)
writer.writerow(["step", "sim_time", "total_queue", "halting", "in_network",
                 "arrived_total", "reward", "cumulative_reward", "phase", "action"])

cumulative_reward = 0.0
arrived_total = 0
n_frames = 0
steps_done = 0
finished = False

try:
    for step in range(TOTAL_STEPS):
        state = get_state()
        action = apply_action(choose_action(state), step)
        traci.simulationStep()

        new_state = get_state()
        reward = -float(sum(new_state[:-1]))
        cumulative_reward += reward
        arrived_total += traci.simulation.getArrivedNumber()
        halting = sum(traci.lanearea.getLastStepHaltingNumber(d) for d in DETECTORS)

        writer.writerow([step, round(traci.simulation.getTime(), 2), int(sum(new_state[:-1])), halting,
                         traci.vehicle.getIDCount(), arrived_total, round(reward, 2),
                         round(cumulative_reward, 2), new_state[-1], action])

        if not NO_FRAMES and step % FRAME_EVERY == 0:
            # Fail fast if this SUMO cannot write the chosen picture format
            if step == 3 * FRAME_EVERY and not os.path.exists(os.path.join(frames_dir, f"00000.{FRAME_FORMAT}")):
                sys.exit(f"\nNo picture was saved. Your SUMO may not support .{FRAME_FORMAT} files.\n"
                         f"Set FRAME_FORMAT = \"png\" at the top of traci9_record.py and run again.")
            traci.gui.screenshot("View #0", os.path.abspath(os.path.join(frames_dir, f"{n_frames:05d}.{FRAME_FORMAT}")),
                                 FRAME_SIZE[0], FRAME_SIZE[1])
            n_frames += 1

        steps_done = step + 1
        if step % 1000 == 0:
            csv_file.flush()
            print(f"  step {step:5d}  vehicles at stop lines: {int(sum(new_state[:-1]))}  "
                  f"cumulative reward: {cumulative_reward:.0f}", flush=True)
    finished = True
finally:
    # Runs even if you press Ctrl+C, close the window, or an error happens
    csv_file.close()
    write_meta(steps_done, n_frames)
    try:
        traci.close()
    except Exception:
        pass

print(f"\nDone. Final cumulative reward: {cumulative_reward:.0f}, vehicles that finished their trip: {arrived_total}")
print(f"Saved in {out_dir}/")
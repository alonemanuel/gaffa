using System;
using System.Collections.Generic;

namespace Gaffa.Engine
{
    public enum Team { Us, Them }

    public enum Role { GK, LCB, RCB, LM, CM, RM, ST }

    public static class Pitch
    {
        /// <summary>7v7 pitch in metres. We attack toward +x; our goal is at x = 0.</summary>
        public const double L = 60;
        public const double W = 40;
    }

    public sealed class Player
    {
        public string Id;
        public Team Team;
        public Role Role;
        public int Num;
        public Vec2 Pos;
        /// <summary>Home position in the team shape; movement policies drift back toward it.</summary>
        public Vec2 Anchor;
        /// <summary>Radians, pitch coordinates.</summary>
        public double Facing;

        public Player(string id, Team team, Role role, int num, Vec2 pos, Vec2 anchor, double facing)
        {
            Id = id;
            Team = team;
            Role = role;
            Num = num;
            Pos = pos;
            Anchor = anchor;
            Facing = facing;
        }

        public Player Clone() => new Player(Id, Team, Role, Num, Pos, Anchor, Facing);
    }

    public sealed class State
    {
        public List<Player> Players;
        public Vec2 Ball;
        public string? Holder;
        public int Tick;
        /// <summary>A defender just beaten on the dribble; recovers at half pace for one tick.</summary>
        public string? Beaten;

        public State(List<Player> players, Vec2 ball, string? holder, int tick)
        {
            Players = players;
            Ball = ball;
            Holder = holder;
            Tick = tick;
        }

        public State Clone()
        {
            var players = new List<Player>(Players.Count);
            foreach (var p in Players) players.Add(p.Clone());
            return new State(players, Ball, Holder, Tick) { Beaten = Beaten };
        }

        public Player PlayerById(string id)
        {
            foreach (var p in Players) if (p.Id == id) return p;
            throw new InvalidOperationException($"no player {id}");
        }

        public int IndexOf(string id)
        {
            for (var i = 0; i < Players.Count; i++) if (Players[i].Id == id) return i;
            return -1;
        }
    }

    public enum ActionKind { Pass, Dribble, Clear }

    public readonly struct GameAction
    {
        public readonly ActionKind Kind;
        public readonly string? To;

        private GameAction(ActionKind kind, string? to)
        {
            Kind = kind;
            To = to;
        }

        public static GameAction Pass(string to) => new GameAction(ActionKind.Pass, to);
        public static readonly GameAction Dribble = new GameAction(ActionKind.Dribble, null);
        public static readonly GameAction Clear = new GameAction(ActionKind.Clear, null);

        public string Key => Kind == ActionKind.Pass ? "pass:" + To : Kind == ActionKind.Dribble ? "dribble" : "clear";
    }

    public enum Outcome { Retained, Lost, Cleared, Chance, Goal, Saved }

    public sealed class Resolution
    {
        public GameAction Action;
        public bool Success;
        public Outcome Outcome;
        public string Text;
        public State Before;
        public State After;
        /// <summary>Where the ball travels during this action, pitch coords.</summary>
        public List<Vec2> BallPath;
        /// <summary>Recorded motion for playback.</summary>
        public Timeline Timeline;

        public Resolution(GameAction action, bool success, Outcome outcome, string text, State before, State after, List<Vec2> ballPath, Timeline timeline)
        {
            Action = action;
            Success = success;
            Outcome = outcome;
            Text = text;
            Before = before;
            After = after;
            BallPath = ballPath;
            Timeline = timeline;
        }
    }

    public static class Names
    {
        public static string ShortName(Player p) => $"#{p.Num} {p.Role}";

        /// <summary>How the player reads from our bench: "#4 LCB" for ours, "their #9 ST" for theirs.</summary>
        public static string NameOf(Player p) => p.Team == Team.Us ? ShortName(p) : "their " + ShortName(p);

        public static string Sentence(string t) => t.Length == 0 ? t : char.ToUpperInvariant(t[0]) + t.Substring(1);
    }
}

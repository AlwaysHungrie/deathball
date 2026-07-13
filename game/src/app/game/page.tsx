import GameScreen from "@/components/game/GameScreen";

/**
 * The pitch.
 *
 * Nothing is read from the URL. The match — both teams, and the odds the run is
 * played against — is handed over in the replay context, which is mounted in the
 * root layout above both this route and the start screen, so it survives the
 * navigation between them.
 *
 * The cost is that `/game` is not a page you can bookmark or refresh: a context is
 * memory, and a reload is a new process. `GameScreen` therefore treats "no replay"
 * as a real state and sends the player back to pick one, rather than rendering a
 * pitch with no teams on it.
 */
export default function GamePage() {
  return <GameScreen />;
}

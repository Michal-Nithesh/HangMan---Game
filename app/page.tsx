"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { RefreshCw, ArrowRight } from "lucide-react"
import { supabase } from "@/lib/supabase"

interface Team {
  id: number
  name: string
  color: string
}

interface GameWord {
  id: number
  word: string
  points: number
}

interface GameScore {
  team_id: number
  points: number
}

export default function HangmanGame() {
  const [teams, setTeams] = useState<Team[]>([])
  const [words, setWords] = useState<GameWord[]>([])
  const [gameScores, setGameScores] = useState<GameScore[]>([])
  const [currentGameId, setCurrentGameId] = useState<number | null>(null)
  const [currentWordIndex, setCurrentWordIndex] = useState(0)
  const [currentTeam, setCurrentTeam] = useState(0)
  const [originalTeamForQuestion, setOriginalTeamForQuestion] = useState(0) // Track which team this question belongs to
  const [guessedLetters, setGuessedLetters] = useState<string[]>([])
  const [revealedPositions, setRevealedPositions] = useState<number[]>([]) // Track which positions are revealed
  const [defaultRevealedPositions, setDefaultRevealedPositions] = useState<number[]>([]) // Default revealed letters
  const [wrongGuesses, setWrongGuesses] = useState(0)
  const [gameState, setGameState] = useState<"playing" | "won" | "lost" | "finished" | "loading">("loading")
  const [inputLetter, setInputLetter] = useState("")
  const [teamsAttempted, setTeamsAttempted] = useState<number[]>([])
  const [isPassedQuestion, setIsPassedQuestion] = useState(false)

  const [wordError, setWordError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [setupProgress, setSetupProgress] = useState("")

  const currentGameWord = words[currentWordIndex]
  const maxWrongGuesses = 4

  // Load initial data
  useEffect(() => {
    loadInitialData()
  }, [])

  // Generate default revealed positions when word changes
  useEffect(() => {
    if (currentGameWord) {
      generateDefaultRevealedPositions()
    }
  }, [currentWordIndex, currentGameWord])

  const generateDefaultRevealedPositions = () => {
    if (!currentGameWord) return

    const wordLength = currentGameWord.word.length
    const numToReveal = Math.min(3, Math.floor(wordLength * 0.3)) // Reveal 2-3 letters or 30% of word
    const positions: number[] = []

    // Randomly select positions to reveal
    while (positions.length < numToReveal) {
      const randomPos = Math.floor(Math.random() * wordLength)
      if (!positions.includes(randomPos)) {
        positions.push(randomPos)
      }
    }

    setDefaultRevealedPositions(positions.sort((a, b) => a - b))
  }

  const loadInitialData = async () => {
    try {
      setIsLoading(true)
      setSetupProgress("Loading teams...")

      const { data: teamsData, error: teamsError } = await supabase.from("teams").select("*").order("id")

      if (teamsError) {
        console.error("Teams error:", teamsError)
        throw teamsError
      }

      if (!teamsData || teamsData.length === 0) {
        setWordError("No teams found in database!")
        return
      }

      setTeams(teamsData)

      setSetupProgress("Loading words...")
      const { data: wordsData, error: wordsError } = await supabase.from("words").select("*").order("created_at")

      if (wordsError) {
        console.error("Words error:", wordsError)
        throw wordsError
      }

      if (!wordsData || wordsData.length === 0) {
        setWordError("No words found in database!")
        return
      }

      setWords(wordsData)

      // Auto-start the game
      setSetupProgress("Starting game...")
      await autoStartGame(teamsData, wordsData)
    } catch (error) {
      console.error("Error loading data:", error)
      setWordError(`Database error: ${error.message}`)
    } finally {
      setIsLoading(false)
      setSetupProgress("")
    }
  }

  const autoStartGame = async (teamsData: Team[], wordsData: GameWord[]) => {
    if (wordsData.length === 0) {
      setWordError("No words available to play!")
      return
    }

    try {
      // Create new game
      const { data: gameData, error: gameError } = await supabase
        .from("games")
        .insert([
          {
            status: "active",
            current_word_id: wordsData[0].id,
            current_team_id: teamsData[0].id,
          },
        ])
        .select()

      if (gameError) throw gameError

      const gameId = gameData[0].id
      setCurrentGameId(gameId)

      // Initialize game scores for all teams
      const scoreInserts = teamsData.map((team) => ({
        game_id: gameId,
        team_id: team.id,
        points: 0,
      }))

      const { error: scoresError } = await supabase.from("game_scores").insert(scoreInserts)

      if (scoresError) throw scoresError

      setGameScores(scoreInserts)
      setGameState("playing")
      setTeamsAttempted([])
      setCurrentWordIndex(0)

      // Set the team based on question number (word index) - Fixed team numbers 0,1,2,3
      const assignedTeam = 0 % 4 // First question goes to Team 1 (index 0)
      setCurrentTeam(assignedTeam)
      setOriginalTeamForQuestion(assignedTeam)
      setIsPassedQuestion(false)
      resetGame()
    } catch (error) {
      console.error("Error starting game:", error)
      setWordError("Failed to start game")
    }
  }

  const resetGame = () => {
    setGuessedLetters([])
    setRevealedPositions([])
    setWrongGuesses(0)
    setGameState("playing")
    setInputLetter("")
  }

  const updateGameScore = async (teamId: number, points: number) => {
    if (!currentGameId) return

    try {
      const currentScore = gameScores.find((score) => score.team_id === teamId)?.points || 0
      const newPoints = currentScore + points

      const { error } = await supabase
        .from("game_scores")
        .update({ points: newPoints })
        .eq("game_id", currentGameId)
        .eq("team_id", teamId)

      if (error) throw error

      setGameScores((prev) => prev.map((score) => (score.team_id === teamId ? { ...score, points: newPoints } : score)))
    } catch (error) {
      console.error("Error updating score:", error)
    }
  }

  const nextTeamOrWord = () => {
    const newTeamsAttempted = [...teamsAttempted, currentTeam]
    setTeamsAttempted(newTeamsAttempted)

    // Check if ALL 4 teams have had their turn as the current team
    if (newTeamsAttempted.length >= 4) {
      // All 4 teams have had their turn, reveal the answer and move to next word
      setGameState("lost") // Show the answer
      setTimeout(() => {
        if (currentWordIndex + 1 < words.length) {
          const nextWordIndex = currentWordIndex + 1
          setCurrentWordIndex(nextWordIndex)

          // Assign next question to next team in rotation (fixed 0,1,2,3 cycle)
          const assignedTeam = nextWordIndex % 4
          setCurrentTeam(assignedTeam)
          setOriginalTeamForQuestion(assignedTeam)
          setTeamsAttempted([])
          setIsPassedQuestion(false)
        } else {
          setGameState("finished")
          return
        }
        resetGame()
      }, 3000) // Show answer for 3 seconds
    } else {
      // Pass to next team in sequence (fixed 0,1,2,3 cycle)
      let nextTeam = (currentTeam + 1) % 4
      while (newTeamsAttempted.includes(nextTeam)) {
        nextTeam = (nextTeam + 1) % 4
      }
      setCurrentTeam(nextTeam)
      setIsPassedQuestion(true) // Mark as passed question for 5 points
      resetGame()
    }
  }

  const passQuestion = () => {
    nextTeamOrWord()
  }

  const guessLetter = () => {
    if (!inputLetter) {
      return
    }

    const letter = inputLetter.toUpperCase()

    // Always allow the letter to be guessed (even if guessed before)
    const newGuessedLetters = [...guessedLetters, letter]
    setGuessedLetters(newGuessedLetters)

    if (!currentGameWord.word.includes(letter)) {
      const newWrongGuesses = wrongGuesses + 1
      setWrongGuesses(newWrongGuesses)

      if (newWrongGuesses >= maxWrongGuesses) {
        // Don't reveal answer here, just pass to next team
        setTimeout(passQuestion, 2000)
      }
    } else {
      // Reveal one occurrence of the letter at a time
      const wordArray = currentGameWord.word.split("")
      const letterPositions = wordArray.map((char, index) => (char === letter ? index : -1)).filter((pos) => pos !== -1)

      // Find the first position of this letter that hasn't been revealed yet
      const unrevealedPosition = letterPositions.find((pos) => !revealedPositions.includes(pos))

      if (unrevealedPosition !== undefined) {
        const newRevealedPositions = [...revealedPositions, unrevealedPosition]
        setRevealedPositions(newRevealedPositions)

        // Check if word is complete (all positions revealed or default revealed)
        const allPositions = [...newRevealedPositions, ...defaultRevealedPositions]
        const uniquePositions = [...new Set(allPositions)]
        const isComplete = uniquePositions.length === wordArray.length

        if (isComplete) {
          setGameState("won")
          const teamId = teams[currentTeam].id
          const points = isPassedQuestion ? 5 : currentGameWord.points
          updateGameScore(teamId, points)

          setTimeout(() => {
            if (currentWordIndex + 1 < words.length) {
              const nextWordIndex = currentWordIndex + 1
              setCurrentWordIndex(nextWordIndex)

              // Assign next question to next team in rotation (fixed 0,1,2,3 cycle)
              const assignedTeam = nextWordIndex % 4
              setCurrentTeam(assignedTeam)
              setOriginalTeamForQuestion(assignedTeam)
              setTeamsAttempted([])
              setIsPassedQuestion(false)
            } else {
              setGameState("finished")
              return
            }
            resetGame()
          }, 2000)
        }
      }
    }

    setInputLetter("")
  }

  // Display word with default revealed letters and guessed letters
  const displayWord = () => {
    if (!currentGameWord) return ""

    return currentGameWord.word
      .split("")
      .map((letter, index) => {
        // Show if it's a default revealed position or a revealed position from guessing
        if (defaultRevealedPositions.includes(index) || revealedPositions.includes(index)) {
          return letter
        }
        return "_"
      })
      .join(" ")
  }

  const getTeamScores = () => {
    return teams
      .map((team, index) => ({
        ...team,
        teamNumber: index + 1, // Fixed team numbers 1,2,3,4
        points: gameScores.find((score) => score.team_id === team.id)?.points || 0,
      }))
      .sort((a, b) => b.points - a.points)
  }

  const HangmanDrawing = ({ stage }: { stage: number }) => (
    <svg width="200" height="250" viewBox="0 0 200 250" className="border rounded-lg bg-white">
      <line x1="10" y1="230" x2="150" y2="230" stroke="brown" strokeWidth="4" />
      <line x1="30" y1="230" x2="30" y2="20" stroke="brown" strokeWidth="4" />
      <line x1="30" y1="20" x2="120" y2="20" stroke="brown" strokeWidth="4" />
      {stage >= 1 && <line x1="120" y1="20" x2="120" y2="50" stroke="brown" strokeWidth="3" />}
      {stage >= 2 && <circle cx="120" cy="65" r="15" stroke="black" strokeWidth="2" fill="none" />}
      {stage >= 3 && <line x1="120" y1="80" x2="120" y2="160" stroke="black" strokeWidth="2" />}
      {stage >= 4 && (
        <>
          <line x1="120" y1="100" x2="100" y2="130" stroke="black" strokeWidth="2" />
          <line x1="120" y1="100" x2="140" y2="130" stroke="black" strokeWidth="2" />
          <line x1="120" y1="160" x2="100" y2="190" stroke="black" strokeWidth="2" />
          <line x1="120" y1="160" x2="140" y2="190" stroke="black" strokeWidth="2" />
        </>
      )}
    </svg>
  )

  if (gameState === "loading") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-100 via-orange-50 to-yellow-100 flex items-center justify-center">
        <Card className="w-96">
          <CardContent className="flex flex-col items-center justify-center p-8">
            <RefreshCw className="w-8 h-8 animate-spin mr-3" />
            <span className="text-lg">Loading game data...</span>
            {setupProgress && <p className="text-sm text-gray-600 mt-2">{setupProgress}</p>}
          </CardContent>
        </Card>
      </div>
    )
  }

  if (wordError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-100 via-orange-50 to-yellow-100 flex items-center justify-center">
        <Card className="w-96">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold text-red-600">Error</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-gray-600">{wordError}</p>
            <Button onClick={() => window.location.reload()} className="w-full">
              Reload Game
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Game Finished
  if (gameState === "finished") {
    const sortedTeams = getTeamScores()
    const winner = sortedTeams[0]

    return (
      <div className="min-h-screen bg-gradient-to-br from-green-400 to-blue-600 flex items-center justify-center">
        <Card className="w-96">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl font-bold text-green-600">🏆 Game Finished!</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <div className="text-2xl font-bold text-yellow-600">Winner: {winner.name}</div>
            <div className="text-xl">Final Score: {winner.points} points</div>
            <div className="space-y-2">
              <h3 className="font-semibold">Final Leaderboard:</h3>
              {sortedTeams.map((team, index) => (
                <div key={team.id} className="flex justify-between items-center p-2 bg-gray-100 rounded">
                  <span>
                    #{index + 1} Team {team.teamNumber}: {team.name}
                  </span>
                  <span className="font-bold">{team.points} pts</span>
                </div>
              ))}
            </div>
            <Button onClick={() => window.location.reload()} className="w-full">
              Start New Game
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Main Game
  const sortedTeams = getTeamScores()

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-100 via-orange-50 to-yellow-100 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-6">
          <h1 className="text-4xl font-bold text-amber-700 mb-2">⚔️ Word Quest</h1>
          <div className="flex justify-center gap-4 text-sm flex-wrap mb-4">
            <Badge variant="outline" className="bg-amber-50 border-amber-300">
              Quest: {currentWordIndex + 1}/{words.length}
            </Badge>
            <Badge className="bg-amber-600 text-white">Assigned to: {teams[originalTeamForQuestion]?.name}</Badge>
            <Badge className={teams[currentTeam]?.color + " text-white"}>Current: {teams[currentTeam]?.name}</Badge>
            <Badge variant="secondary" className="bg-stone-200">
              Tribes Attempted: {teamsAttempted.length + 1}/4
            </Badge>
            {isPassedQuestion && <Badge className="bg-orange-500 text-white">Passed Quest (5 pts)</Badge>}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Side - Hangman */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-center text-amber-800">Gallows</CardTitle>
                <div className="text-center">
                  <Badge variant={wrongGuesses >= maxWrongGuesses ? "destructive" : "secondary"}>
                    Wrong Guesses: {wrongGuesses}/{maxWrongGuesses}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex justify-center">
                <HangmanDrawing stage={wrongGuesses} />
              </CardContent>
            </Card>

            {/* Game Area */}
            <Card>
              <CardHeader>
                <CardTitle className="text-center text-amber-800">Sacred Word</CardTitle>
                <p className="text-center text-sm text-amber-600">{currentGameWord?.word.length} letters</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center">
                  <div className="text-4xl font-mono font-bold tracking-wider mb-4 min-h-[4rem] flex items-center justify-center">
                    {displayWord()}
                  </div>
                  <Badge
                    className={isPassedQuestion ? "bg-orange-500 text-lg px-4 py-2" : "bg-amber-600 text-lg px-4 py-2"}
                  >
                    Gold: {isPassedQuestion ? 5 : currentGameWord?.points}
                  </Badge>
                </div>

                {gameState === "playing" && (
                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <Input
                        type="text"
                        maxLength={1}
                        value={inputLetter}
                        onChange={(e) => setInputLetter(e.target.value.toUpperCase())}
                        placeholder="Enter a letter"
                        className="text-center text-2xl h-12"
                        onKeyPress={(e) => e.key === "Enter" && guessLetter()}
                      />
                      <Button
                        onClick={guessLetter}
                        disabled={!inputLetter}
                        className="h-12 px-6 bg-amber-600 hover:bg-amber-700"
                      >
                        Guess
                      </Button>
                      <Button
                        onClick={passQuestion}
                        variant="outline"
                        className="h-12 px-4 border-amber-500 text-amber-700 hover:bg-amber-50 bg-transparent"
                      >
                        <ArrowRight className="w-4 h-4 mr-1" />
                        Pass
                      </Button>
                    </div>

                    <div className="text-center">
                      <p className="text-sm text-gray-600 mb-2">Guessed Letters:</p>
                      <div className="flex flex-wrap justify-center gap-2">
                        {guessedLetters.map((letter, index) => (
                          <Badge key={`${letter}-${index}`} variant="outline" className="text-sm px-3 py-1">
                            {letter}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="text-center text-xs text-amber-700 bg-amber-50 p-3 rounded-lg border border-amber-200">
                      <p className="font-semibold mb-1">⚔️ Quest Rules ⚔️</p>
                      <p>• Each sacred word is assigned to a tribe in rotation</p>
                      <p>• If a tribe fails, the next tribe may attempt for 5 gold</p>
                      <p>• The word is revealed only when all tribes have tried</p>
                    </div>
                  </div>
                )}

                {gameState === "won" && (
                  <div className="text-center">
                    <div className="text-3xl font-bold text-amber-600 mb-2">🏆 Victory!</div>
                    <p className="text-lg">
                      +{isPassedQuestion ? 5 : currentGameWord?.points} gold to {teams[currentTeam]?.name}
                    </p>
                    {isPassedQuestion && <p className="text-sm text-orange-600">Passed quest bonus!</p>}
                    <p className="text-sm text-amber-600">Moving to next sacred word...</p>
                  </div>
                )}

                {gameState === "lost" && (
                  <div className="text-center">
                    {teamsAttempted.length >= 4 ? (
                      <>
                        <div className="text-3xl font-bold text-red-700 mb-2">📜 Word Revealed!</div>
                        <p className="text-lg text-amber-800">
                          The sacred word was: <strong>{currentGameWord?.word}</strong>
                        </p>
                        <p className="text-sm text-amber-600">All tribes have tried. Moving to next quest...</p>
                      </>
                    ) : (
                      <>
                        <div className="text-3xl font-bold text-orange-600 mb-2">⚡ Quest Failed!</div>
                        <p className="text-lg text-amber-700">{teams[currentTeam]?.name} could not solve the riddle</p>
                        <p className="text-sm text-amber-600">Passing to next tribe...</p>
                      </>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Side - Leaderboard */}
          <div>
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="text-center text-2xl text-amber-800">🏺 Leaderboard</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {teams.map((team, index) => {
                    const teamScore = gameScores.find((score) => score.team_id === team.id)?.points || 0
                    const leaderboardPosition = sortedTeams.findIndex((t) => t.id === team.id) + 1
                    return (
                      <div
                        key={team.id}
                        className={`p-4 rounded-lg border-2 ${
                          index === currentTeam
                            ? "border-purple-500 bg-purple-50"
                            : index === originalTeamForQuestion
                              ? "border-blue-500 bg-blue-50"
                              : "border-gray-200"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="text-2xl font-bold">#{leaderboardPosition}</div>
                            <div className={`w-4 h-4 rounded-full ${team.color}`}></div>
                            <div className="font-semibold text-lg">
                              Team {index + 1}: {team.name}
                            </div>
                            {index === originalTeamForQuestion && (
                              <Badge variant="outline" className="text-xs bg-blue-100">
                                Assigned
                              </Badge>
                            )}
                            {teamsAttempted.includes(index) && (
                              <Badge variant="outline" className="text-xs">
                                Attempted
                              </Badge>
                            )}
                          </div>
                          <div className="text-2xl font-bold text-purple-600">{teamScore}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

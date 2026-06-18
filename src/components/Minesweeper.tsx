import { useState, useEffect, useRef, useCallback } from 'react';
import { ExplosionEffect } from './ExplosionEffect';
import type { ExplosionRef } from './ExplosionEffect';
import { Leaderboard, saveScore } from './Leaderboard';
import {
  playClick,
  playFlag,
  playExplosion,
  playWin,
  playTick,
  setSoundEnabled
} from '../utils/audio';


// Cell interface
interface Cell {
  x: number;
  y: number;
  isMine: boolean;
  isRevealed: boolean;
  isFlagged: boolean;
  count: number; // Neighboring mine count
  exploded?: boolean;
  highlighted?: boolean;
}

// Difficulty Presets
type Difficulty = 'beginner' | 'intermediate' | 'expert' | 'custom';

interface DifficultyPreset {
  rows: number;
  cols: number;
  mines: number;
}

const PRESETS: Record<Exclude<Difficulty, 'custom'>, DifficultyPreset> = {
  beginner: { rows: 9, cols: 9, mines: 10 },
  intermediate: { rows: 16, cols: 16, mines: 40 },
  expert: { rows: 16, cols: 30, mines: 99 }
};

export const Minesweeper: React.FC = () => {
  // Theme state
  const [theme, setTheme] = useState<'cyberpunk' | 'retro' | 'aurora'>('cyberpunk');

  // Difficulty states
  const [difficulty, setDifficulty] = useState<Difficulty>('beginner');
  const [customRows, setCustomRows] = useState(16);
  const [customCols, setCustomCols] = useState(30);
  const [customMines, setCustomMines] = useState(99);
  const [showCustomInputs, setShowCustomInputs] = useState(false);

  // Active board dimensions
  const [rows, setRows] = useState(PRESETS.beginner.rows);
  const [cols, setCols] = useState(PRESETS.beginner.cols);
  const [minesCount, setMinesCount] = useState(PRESETS.beginner.mines);

  // Game States
  const [board, setBoard] = useState<Cell[][]>([]);
  const [gameState, setGameState] = useState<'idle' | 'playing' | 'won' | 'lost'>('idle');
  const [flagsCount, setFlagsCount] = useState(0);
  const [timer, setTimer] = useState(0);
  const [soundOn, setSoundOn] = useState(true);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [recentWin, setRecentWin] = useState(false);
  const [faceEmoji, setFaceEmoji] = useState('🙂');

  // Scaling factor for large boards
  const [boardScale, setBoardScale] = useState(1);

  // Refs
  const explosionRef = useRef<ExplosionRef>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const isMouseDownRef = useRef(false);

  // Mobile Long Press variables
  const touchTimeoutRef = useRef<number | null>(null);
  const isLongPressRef = useRef(false);

  // Sound switch sync
  useEffect(() => {
    setSoundEnabled(soundOn);
  }, [soundOn]);

  // Handle board responsive scaling
  const adjustScale = useCallback(() => {
    if (!boardRef.current) return;
    const parent = boardRef.current.parentElement;
    if (!parent) return;

    const padding = 32; // combined padding
    const parentWidth = parent.clientWidth - padding;
    const boardWidth = cols * 32; // cell size is 32px

    if (boardWidth > parentWidth) {
      setBoardScale(parentWidth / boardWidth);
    } else {
      setBoardScale(1);
    }
  }, [cols]);

  useEffect(() => {
    adjustScale();
    window.addEventListener('resize', adjustScale);
    return () => window.removeEventListener('resize', adjustScale);
  }, [adjustScale, board]);

  // Set grid dimensions when presets change
  const applyPreset = (diff: Difficulty) => {
    setDifficulty(diff);
    if (diff === 'custom') {
      setShowCustomInputs(true);
    } else {
      setShowCustomInputs(false);
      const preset = PRESETS[diff];
      setRows(preset.rows);
      setCols(preset.cols);
      setMinesCount(preset.mines);
    }
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Validate inputs
    const r = Math.max(8, Math.min(40, customRows));
    const c = Math.max(8, Math.min(50, customCols));
    const maxMines = Math.floor((r * c) * 0.7); // Max 70% mine density
    const m = Math.max(1, Math.min(maxMines, customMines));

    setCustomRows(r);
    setCustomCols(c);
    setCustomMines(m);

    setRows(r);
    setCols(c);
    setMinesCount(m);
    setShowCustomInputs(false);
  };

  // Initialize board empty cells
  const initBoard = useCallback(() => {
    const newBoard: Cell[][] = [];
    for (let r = 0; r < rows; r++) {
      const rowCells: Cell[] = [];
      for (let c = 0; c < cols; c++) {
        rowCells.push({
          x: c,
          y: r,
          isMine: false,
          isRevealed: false,
          isFlagged: false,
          count: 0
        });
      }
      newBoard.push(rowCells);
    }
    setBoard(newBoard);
    setGameState('idle');
    setFlagsCount(0);
    setTimer(0);
    setRecentWin(false);
    setFaceEmoji('🙂');

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, [rows, cols]);

  // Initialize on mount or preset changes
  useEffect(() => {
    initBoard();
  }, [initBoard]);

  // Timer Effect
  useEffect(() => {
    if (gameState === 'playing') {
      timerIntervalRef.current = window.setInterval(() => {
        setTimer((t) => {
          const next = t + 1;
          if (next % 10 === 0) {
            playTick(); // Tick sound every 10 seconds or every second if desired
          }
          return next;
        });
      }, 1000);
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [gameState]);



  // Safe First Click Mine Generation
  const generateMines = (startRow: number, startCol: number, currentBoard: Cell[][]) => {
    const totalCells = rows * cols;
    const candidates: { r: number; c: number }[] = [];

    // Exclude start cell and its 8 neighbors for safe click
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const isStartOrNeighbor = Math.abs(r - startRow) <= 1 && Math.abs(c - startCol) <= 1;
        // If grid size is large enough, exclude neighborhood. Otherwise, exclude just start.
        if (totalCells - 9 >= minesCount) {
          if (!isStartOrNeighbor) candidates.push({ r, c });
        } else {
          if (r !== startRow || c !== startCol) candidates.push({ r, c });
        }
      }
    }

    // Fisher-Yates Shuffle candidates
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }

    // Place mines
    const minePositions = candidates.slice(0, minesCount);
    minePositions.forEach(({ r, c }) => {
      currentBoard[r][c].isMine = true;
    });

    // Compute mine counts
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (currentBoard[r][c].isMine) continue;
        let count = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
              if (currentBoard[nr][nc].isMine) count++;
            }
          }
        }
        currentBoard[r][c].count = count;
      }
    }
  };

  // Get physical coordinate relative to grid container for explosions
  const getCellCoordinates = (r: number, c: number): { x: number; y: number } | null => {
    const cellId = `cell-${r}-${c}`;
    const el = document.getElementById(cellId);
    const container = document.querySelector('.grid-container');
    if (el && container) {
      const containerRect = container.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      return {
        x: (elRect.left - containerRect.left + elRect.width / 2) / boardScale,
        y: (elRect.top - containerRect.top + elRect.height / 2) / boardScale
      };
    }
    return null;
  };

  // Reveal Cell Logic
  const revealCell = (r: number, c: number) => {
    if (gameState === 'lost' || gameState === 'won') return;

    let currentBoard = JSON.parse(JSON.stringify(board)) as Cell[][];
    // First click logic
    if (gameState === 'idle') {
      generateMines(r, c, currentBoard);
      setGameState('playing');
    }

    const cell = currentBoard[r][c];
    if (cell.isRevealed || cell.isFlagged) return;

    // Hit a mine!
    if (cell.isMine) {
      cell.exploded = true;
      cell.isRevealed = true;
      setGameState('lost');
      setFaceEmoji('😵');
      playExplosion();

      // Reveal all mines and incorrect flags
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          if (currentBoard[i][j].isMine) {
            currentBoard[i][j].isRevealed = true;
          } else if (currentBoard[i][j].isFlagged) {
            // Flagged but not a mine (incorrect flag)
            // We keep it flagged but we'll show special visual style
          }
        }
      }

      setBoard(currentBoard);

      // Cascading visual explosion animation
      setTimeout(() => {
        const primaryCoords = getCellCoordinates(r, c);
        if (primaryCoords && explosionRef.current) {
          explosionRef.current.trigger(primaryCoords.x * boardScale, primaryCoords.y * boardScale, theme);
        }

        // Boom others sequentially
        let mineCells: { r: number; c: number }[] = [];
        for (let i = 0; i < rows; i++) {
          for (let j = 0; j < cols; j++) {
            if (currentBoard[i][j].isMine && (i !== r || j !== c)) {
              mineCells.push({ r: i, c: j });
            }
          }
        }

        // Shuffle secondary mine list
        mineCells = mineCells.sort(() => Math.random() - 0.5);

        // Explode up to 15 mines in a quick cascade
        mineCells.slice(0, 15).forEach((m, idx) => {
          setTimeout(() => {
            const coords = getCellCoordinates(m.r, m.c);
            if (coords && explosionRef.current) {
              explosionRef.current.trigger(coords.x * boardScale, coords.y * boardScale, theme);
              if (idx % 3 === 0) playExplosion(); // sound overlay limit
            }
          }, (idx + 1) * 90);
        });
      }, 50);

      return;
    }

    // Normal reveal
    playClick();

    // Reveal queue for zero cascades
    const queue: [number, number][] = [[r, c]];
    cell.isRevealed = true;

    while (queue.length > 0) {
      const [currR, currC] = queue.shift()!;
      const currCell = currentBoard[currR][currC];

      if (currCell.count === 0) {
        // Check 8 neighbors
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = currR + dr;
            const nc = currC + dc;

            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
              const neighbor = currentBoard[nr][nc];
              if (!neighbor.isRevealed && !neighbor.isFlagged && !neighbor.isMine) {
                neighbor.isRevealed = true;
                queue.push([nr, nc]);
              }
            }
          }
        }
      }
    }

    // Check Win Condition
    let revealedCount = 0;
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        if (currentBoard[i][j].isRevealed) revealedCount++;
      }
    }

    if (revealedCount === rows * cols - minesCount) {
      setGameState('won');
      setFaceEmoji('😎');
      playWin();

      // Flag all remaining mines
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          if (currentBoard[i][j].isMine && !currentBoard[i][j].isFlagged) {
            currentBoard[i][j].isFlagged = true;
          }
        }
      }
      setFlagsCount(minesCount);

      // Check if eligible for Leaderboard record
      if (difficulty !== 'custom') {
        const timeScored = timer;
        const isNewRecord = saveScore(difficulty, timeScored);
        if (isNewRecord) {
          setRecentWin(true);
        }
      }
    }

    setBoard(currentBoard);
  };

  // Toggle Flag
  const toggleFlag = (r: number, c: number, e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (gameState === 'lost' || gameState === 'won') return;

    // Cannot flag revealed cells
    if (board[r][c].isRevealed) return;

    const newBoard = [...board];
    const cell = newBoard[r][c];
    const newFlagged = !cell.isFlagged;

    cell.isFlagged = newFlagged;
    playFlag();
    setFlagsCount((fc) => fc + (newFlagged ? 1 : -1));
    setBoard(newBoard);
  };

  // Chording Logic: Reveal neighbors when flagged match counts
  const handleChording = (r: number, c: number) => {
    if (gameState !== 'playing') return;

    const cell = board[r][c];
    if (!cell.isRevealed || cell.count === 0) return;

    // Count flagged neighbors
    let flaggedNeighbors = 0;
    const neighbors: { r: number; c: number }[] = [];

    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
          neighbors.push({ r: nr, c: nc });
          if (board[nr][nc].isFlagged) {
            flaggedNeighbors++;
          }
        }
      }
    }

    // If flags match the cell number value, reveal non-flagged neighbors
    if (flaggedNeighbors === cell.count) {
      let hitMine = false;
      let firstMineR = -1;
      let firstMineC = -1;

      // Make a working copy
      let currentBoard = JSON.parse(JSON.stringify(board)) as Cell[][];

      const queue: [number, number][] = [];

      neighbors.forEach(({ r: nr, c: nc }) => {
        const neighbor = currentBoard[nr][nc];
        if (!neighbor.isRevealed && !neighbor.isFlagged) {
          if (neighbor.isMine) {
            hitMine = true;
            neighbor.exploded = true;
            neighbor.isRevealed = true;
            if (firstMineR === -1) {
              firstMineR = nr;
              firstMineC = nc;
            }
          } else {
            neighbor.isRevealed = true;
            queue.push([nr, nc]);
          }
        }
      });

      if (hitMine) {
        setGameState('lost');
        setFaceEmoji('😵');
        playExplosion();

        // Reveal all mines
        for (let i = 0; i < rows; i++) {
          for (let j = 0; j < cols; j++) {
            if (currentBoard[i][j].isMine) {
              currentBoard[i][j].isRevealed = true;
            }
          }
        }
        setBoard(currentBoard);

        // Chain trigger particles
        setTimeout(() => {
          const coords = getCellCoordinates(firstMineR, firstMineC);
          if (coords && explosionRef.current) {
            explosionRef.current.trigger(coords.x * boardScale, coords.y * boardScale, theme);
          }
        }, 50);
        return;
      }

      // Safe chording, run cascade for the revealed empty cells
      while (queue.length > 0) {
        const [currR, currC] = queue.shift()!;
        const currCell = currentBoard[currR][currC];

        if (currCell.count === 0) {
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              const nr = currR + dr;
              const nc = currC + dc;
              if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                const neighbor = currentBoard[nr][nc];
                if (!neighbor.isRevealed && !neighbor.isFlagged && !neighbor.isMine) {
                  neighbor.isRevealed = true;
                  queue.push([nr, nc]);
                }
              }
            }
          }
        }
      }

      // Check Win Condition
      let revealedCount = 0;
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          if (currentBoard[i][j].isRevealed) revealedCount++;
        }
      }

      if (revealedCount === rows * cols - minesCount) {
        setGameState('won');
        setFaceEmoji('😎');
        playWin();

        // Flag all remaining mines
        for (let i = 0; i < rows; i++) {
          for (let j = 0; j < cols; j++) {
            if (currentBoard[i][j].isMine && !currentBoard[i][j].isFlagged) {
              currentBoard[i][j].isFlagged = true;
            }
          }
        }
        setFlagsCount(minesCount);

        if (difficulty !== 'custom') {
          const timeScored = timer;
          const isNewRecord = saveScore(difficulty, timeScored);
          if (isNewRecord) {
            setRecentWin(true);
          }
        }
      }

      playClick();
      setBoard(currentBoard);
    } else {
      // Highlight unrevealed neighbors temporarily to indicate what is bound to chord
      const highlightedBoard = board.map((rowCells, rIdx) =>
        rowCells.map((cellItem, cIdx) => {
          const isNeighbor = neighbors.some(n => n.r === rIdx && n.c === cIdx);
          if (isNeighbor && !cellItem.isRevealed && !cellItem.isFlagged) {
            return { ...cellItem, highlighted: true };
          }
          return cellItem;
        })
      );
      setBoard(highlightedBoard);
      setTimeout(() => {
        setBoard((prev) =>
          prev.map((rowCells) =>
            rowCells.map((cellItem) => ({ ...cellItem, highlighted: false }))
          )
        );
      }, 150);
    }
  };

  // Mobile Long Press Handling
  const handleTouchStart = (r: number, c: number) => {
    isLongPressRef.current = false;
    touchTimeoutRef.current = window.setTimeout(() => {
      isLongPressRef.current = true;
      if (window.navigator.vibrate) {
        window.navigator.vibrate(50); // Haptic feedback
      }
      toggleFlag(r, c);
    }, 550); // 550ms hold
  };

  const handleTouchEnd = (r: number, c: number, e: React.TouchEvent) => {
    if (touchTimeoutRef.current) {
      clearTimeout(touchTimeoutRef.current);
      touchTimeoutRef.current = null;
    }

    if (isLongPressRef.current) {
      e.preventDefault(); // Prevents click triggering
    } else {
      revealCell(r, c);
    }
  };

  // Set smiley icon depending on game state
  const handleMouseDownOnCell = () => {
    if (gameState === 'playing' || gameState === 'idle') {
      setFaceEmoji('😮');
    }
    isMouseDownRef.current = true;
  };

  const handleMouseUpGlobal = useCallback(() => {
    if (isMouseDownRef.current) {
      isMouseDownRef.current = false;
      if (gameState === 'playing' || gameState === 'idle') {
        setFaceEmoji('🙂');
      }
    }
  }, [gameState]);

  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUpGlobal);
    return () => window.removeEventListener('mouseup', handleMouseUpGlobal);
  }, [handleMouseUpGlobal]);

  // Digits pad formatting for Mine Counter / Timer
  const formatThreeDigits = (num: number) => {
    const absVal = Math.min(Math.abs(num), 999);
    const str = String(absVal).padStart(3, '0');
    return num < 0 ? `-${str.slice(1)}` : str;
  };

  return (
    <div className={`minesweeper-app theme-${theme}`}>
      <div className="game-container">
        {/* Game Title Bar */}
        <header className="game-header">
          <div className="header-logo">💣 MINESWEEPER</div>
          <div className="header-actions">
            <button
              className="action-btn text-glow"
              onClick={() => setShowLeaderboard(true)}
              title="排行榜"
            >
              🏆 榮譽榜
            </button>
            <button
              className="action-btn"
              onClick={() => setSoundOn(!soundOn)}
              title={soundOn ? '靜音' : '開啟音效'}
            >
              {soundOn ? '🔊' : '🔇'}
            </button>
            <div className="theme-selector">
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value as any)}
                aria-label="選擇主題"
              >
                <option value="cyberpunk">Cyberpunk 霓虹</option>
                <option value="retro">Classic 復古</option>
                <option value="aurora">Aurora 磨砂</option>
              </select>
            </div>
          </div>
        </header>

        {/* Difficulty Controls */}
        <section className="controls-section">
          <div className="difficulty-tabs">
            {(['beginner', 'intermediate', 'expert', 'custom'] as const).map((diff) => (
              <button
                key={diff}
                className={`diff-btn ${difficulty === diff ? 'active' : ''}`}
                onClick={() => applyPreset(diff)}
              >
                {diff === 'beginner' && '初級'}
                {diff === 'intermediate' && '中級'}
                {diff === 'expert' && '高級'}
                {diff === 'custom' && '自訂'}
              </button>
            ))}
          </div>

          {showCustomInputs && (
            <form onSubmit={handleCustomSubmit} className="custom-form">
              <div className="input-group">
                <label>高度 (8-40):</label>
                <input
                  type="number"
                  value={customRows}
                  onChange={(e) => setCustomRows(parseInt(e.target.value) || 0)}
                  min="8"
                  max="40"
                />
              </div>
              <div className="input-group">
                <label>寬度 (8-50):</label>
                <input
                  type="number"
                  value={customCols}
                  onChange={(e) => setCustomCols(parseInt(e.target.value) || 0)}
                  min="8"
                  max="50"
                />
              </div>
              <div className="input-group">
                <label>地雷數量:</label>
                <input
                  type="number"
                  value={customMines}
                  onChange={(e) => setCustomMines(parseInt(e.target.value) || 0)}
                  min="1"
                />
              </div>
              <button type="submit" className="btn btn-submit">
                應用
              </button>
            </form>
          )}
        </section>

        {/* Board Panel */}
        <main className="board-panel">
          {/* Status Bar */}
          <div className="status-bar">
            <div className="digit-display" title="剩餘地雷">
              {formatThreeDigits(minesCount - flagsCount)}
            </div>

            <button
              className="smiley-btn"
              onClick={initBoard}
              title="重新開始"
              aria-label="Reset board"
            >
              {faceEmoji}
            </button>

            <div className="digit-display" title="計時器">
              {formatThreeDigits(timer)}
            </div>
          </div>

          {/* Grid Wrapper */}
          <div className="grid-viewport">
            <div
              className="grid-container"
              ref={boardRef}
              style={{
                gridTemplateColumns: `repeat(${cols}, 32px)`,
                transform: `scale(${boardScale})`,
                transformOrigin: 'top center'
              }}
            >
              {board.map((rowCells, r) =>
                rowCells.map((cell, c) => {
                  let cellClass = 'cell';
                  let cellContent: React.ReactNode = '';

                  if (cell.isRevealed) {
                    cellClass += ' revealed';
                    if (cell.isMine) {
                      cellClass += ' mine';
                      cellClass += cell.exploded ? ' exploded' : '';
                      cellContent = '💣';
                    } else if (cell.count > 0) {
                      cellClass += ` count-${cell.count}`;
                      cellContent = cell.count;
                    }
                  } else {
                    if (cell.isFlagged) {
                      cellClass += ' flagged';
                      // If lost, show incorrect flags (flagged but not mine)
                      if (gameState === 'lost' && !cell.isMine) {
                        cellClass += ' incorrect-flag';
                        cellContent = '❌';
                      } else {
                        cellContent = '🚩';
                      }
                    } else if (cell.highlighted) {
                      cellClass += ' highlighted';
                    }
                  }

                  return (
                    <button
                      key={`${r}-${c}`}
                      id={`cell-${r}-${c}`}
                      className={cellClass}
                      onMouseDown={handleMouseDownOnCell}
                      onMouseUp={() => revealCell(r, c)}
                      onContextMenu={(e) => toggleFlag(r, c, e)}
                      onDoubleClick={() => handleChording(r, c)}
                      onTouchStart={() => handleTouchStart(r, c)}
                      onTouchEnd={(e) => handleTouchEnd(r, c, e)}
                      aria-label={`Cell at row ${r + 1}, column ${c + 1}`}
                    >
                      {cellContent}
                    </button>
                  );
                })
              )}

              {/* Canvas Overlay for Explosion Particles */}
              <ExplosionEffect ref={explosionRef} />
            </div>
          </div>
        </main>

        {/* Win Message / Highscore Alerts */}
        {gameState === 'won' && (
          <div className="game-alert success-alert animate-bounce">
            <h3>🎉 恭喜獲勝！</h3>
            <p>您在 {timer} 秒內清除了所有地雷！</p>
            {recentWin && <p className="new-record-tag">⭐ 締造了新的個人最佳紀錄！</p>}
            <button className="btn btn-primary" onClick={initBoard}>
              再玩一次
            </button>
          </div>
        )}

        {gameState === 'lost' && (
          <div className="game-alert danger-alert animate-shake">
            <h3>💥 踩到地雷了！</h3>
            <p>再接再厲，下一局一定會更好！</p>
            <button className="btn btn-danger" onClick={initBoard}>
              重新挑戰
            </button>
          </div>
        )}

        {/* Info Panel */}
        <footer className="game-footer-info">
          <p>💡 <b>提示：</b>左鍵點擊覆蓋的方格來翻開，右鍵 (手機為長按) 進行插旗標記。</p>
          <p>⚡ <b>快速鍵：</b>雙擊已翻開的數字方格，若周圍已插旗數目相符，可直接翻開剩餘鄰近方格。</p>
        </footer>
      </div>

      {/* Leaderboard Modal */}
      <Leaderboard
        isOpen={showLeaderboard}
        onClose={() => setShowLeaderboard(false)}
        theme={theme}
      />
    </div>
  );
};

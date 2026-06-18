import React, { useState, useEffect } from 'react';

export interface ScoreRecord {
  time: number;
  date: string;
}

export interface LeaderboardData {
  beginner: ScoreRecord[];
  intermediate: ScoreRecord[];
  expert: ScoreRecord[];
}

interface LeaderboardProps {
  isOpen: boolean;
  onClose: () => void;
  theme: 'cyberpunk' | 'retro' | 'aurora';
}

export const getHighScores = (): LeaderboardData => {
  const defaultData: LeaderboardData = { beginner: [], intermediate: [], expert: [] };
  if (typeof window === 'undefined') return defaultData;

  try {
    const raw = localStorage.getItem('minesweeper_leaderboard_v2');
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Failed to parse leaderboard data', e);
  }
  return defaultData;
};

export const saveScore = (difficulty: 'beginner' | 'intermediate' | 'expert', time: number): boolean => {
  if (typeof window === 'undefined') return false;

  const data = getHighScores();
  const records = data[difficulty] || [];

  const newRecord: ScoreRecord = {
    time,
    date: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  };

  const updatedRecords = [...records, newRecord]
    .sort((a, b) => a.time - b.time)
    .slice(0, 5); // Keep top 5

  data[difficulty] = updatedRecords;
  localStorage.setItem('minesweeper_leaderboard_v2', JSON.stringify(data));

  // Return true if the new score made it into the top list
  return updatedRecords.some(r => r.time === time && r.date === newRecord.date);
};

export const Leaderboard: React.FC<LeaderboardProps> = ({ isOpen, onClose, theme }) => {
  const [scores, setScores] = useState<LeaderboardData>({ beginner: [], intermediate: [], expert: [] });
  const [activeTab, setActiveTab] = useState<'beginner' | 'intermediate' | 'expert'>('beginner');

  useEffect(() => {
    if (isOpen) {
      setScores(getHighScores());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClear = () => {
    if (window.confirm('確定要清除所有紀錄嗎？')) {
      const cleared: LeaderboardData = { beginner: [], intermediate: [], expert: [] };
      localStorage.setItem('minesweeper_leaderboard_v2', JSON.stringify(cleared));
      setScores(cleared);
    }
  };

  const getTabLabel = (tab: string) => {
    switch (tab) {
      case 'beginner': return '初級 (Beginner)';
      case 'intermediate': return '中級 (Intermediate)';
      case 'expert': return '高級 (Expert)';
      default: return '';
    }
  };

  return (
    <div className={`leaderboard-overlay active theme-${theme}`}>
      <div className="leaderboard-modal">
        <div className="leaderboard-header">
          <h2>🏆 榮譽榜 (Leaderboard)</h2>
          <button className="close-btn" onClick={onClose} aria-label="Close modal">
            &times;
          </button>
        </div>

        <div className="leaderboard-tabs">
          {(['beginner', 'intermediate', 'expert'] as const).map((tab) => (
            <button
              key={tab}
              className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {getTabLabel(tab)}
            </button>
          ))}
        </div>

        <div className="leaderboard-body">
          {scores[activeTab].length === 0 ? (
            <div className="empty-scores">
              <div className="trophy-icon">⌛</div>
              <p>尚無紀錄，快來締造歷史吧！</p>
            </div>
          ) : (
            <table className="scores-table">
              <thead>
                <tr>
                  <th style={{ width: '20%' }}>名次</th>
                  <th style={{ width: '40%' }}>時間 (秒)</th>
                  <th style={{ width: '40%' }}>日期</th>
                </tr>
              </thead>
              <tbody>
                {scores[activeTab].map((record, index) => (
                  <tr key={index} className={`rank-${index + 1}`}>
                    <td>
                      {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}`}
                    </td>
                    <td className="score-time">{record.time.toFixed(1)}s</td>
                    <td className="score-date">{record.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="leaderboard-footer">
          <button className="btn btn-danger" onClick={handleClear}>
            清除紀錄
          </button>
          <button className="btn btn-primary" onClick={onClose}>
            關閉
          </button>
        </div>
      </div>
    </div>
  );
};

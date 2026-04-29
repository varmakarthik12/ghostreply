package db

import (
	"database/sql"
	"time"
)

type IncomingMessage struct {
	Timestamp         time.Time `json:"timestamp"`
	Content           string    `json:"content"`
	SenderType        string    `json:"sender_type"`  // target|host
	SenderID          string    `json:"sender_id"`
	SenderUsername    string    `json:"sender_username,omitempty"`
	SenderDisplayName string    `json:"sender_display_name,omitempty"`
	SenderGender      string    `json:"sender_gender,omitempty"`
}

type Message struct {
	ID                string `json:"id"`
	ConversationID    string `json:"conversation_id"`
	Timestamp         string `json:"timestamp"`
	Content           string `json:"content"`
	SenderType        string `json:"sender_type"`
	SenderID          string `json:"sender_id"`
	SenderUsername    string `json:"sender_username,omitempty"`
	SenderDisplayName string `json:"sender_display_name,omitempty"`
	SenderGender      string `json:"sender_gender,omitempty"`
}

func (s *Store) SaveMessage(msg IncomingMessage, convID, dedupHash string) (bool, error) {
	_, err := s.db.Exec(
		`INSERT INTO messages (id, conversation_id, dedup_hash, timestamp, content, sender_type, sender_id, sender_username, sender_display_name, sender_gender)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		DedupHash(msg.Content, msg.SenderID, msg.Timestamp.Unix())+"_"+msg.SenderType,
		convID, dedupHash, msg.Timestamp.UTC(), msg.Content,
		msg.SenderType, msg.SenderID, msg.SenderUsername, msg.SenderDisplayName, msg.SenderGender)
	return err == nil, err
}

func (s *Store) GetMessages(convID string, limit int) ([]*Message, error) {
	rows, err := s.db.Query(
		`SELECT id, conversation_id, timestamp, content, sender_type, sender_id, sender_username, sender_display_name, sender_gender
		 FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC LIMIT ?`,
		convID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var msgs []*Message
	for rows.Next() {
		m := &Message{}
		if err := rows.Scan(&m.ID, &m.ConversationID, &m.Timestamp, &m.Content, &m.SenderType, &m.SenderID, &m.SenderUsername, &m.SenderDisplayName, &m.SenderGender); err != nil {
			return nil, err
		}
		msgs = append(msgs, m)
	}
	return msgs, rows.Err()
}

func (s *Store) GetLastMessage(convID string) (*Message, error) {
	m := &Message{}
	err := s.db.QueryRow(
		`SELECT id, conversation_id, timestamp, content, sender_type, sender_id, sender_username, sender_display_name, sender_gender
		 FROM messages WHERE conversation_id = ? ORDER BY timestamp DESC LIMIT 1`,
		convID).Scan(&m.ID, &m.ConversationID, &m.Timestamp, &m.Content, &m.SenderType, &m.SenderID, &m.SenderUsername, &m.SenderDisplayName, &m.SenderGender)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return m, err
}

func (s *Store) MessageExists(convID, dedupHash string) (bool, error) {
	var exists bool
	err := s.db.QueryRow(
		"SELECT EXISTS(SELECT 1 FROM messages WHERE conversation_id = ? AND dedup_hash = ?)",
		convID, dedupHash).Scan(&exists)
	return exists, err
}

func (s *Store) CountMessagesSince(convID, sinceMsgID string) (int, error) {
	var count int
	var err error
	if sinceMsgID == "" {
		err = s.db.QueryRow("SELECT COUNT(*) FROM messages WHERE conversation_id = ?", convID).Scan(&count)
	} else {
		err = s.db.QueryRow("SELECT COUNT(*) FROM messages WHERE conversation_id = ? AND id > ?", convID, sinceMsgID).Scan(&count)
	}
	return count, err
}

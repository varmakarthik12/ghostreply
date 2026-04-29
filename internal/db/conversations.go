package db

import "database/sql"

type Conversation struct {
	ID                 string `json:"id"`
	IntegrationID      string `json:"integration_id"`
	ConvType           string `json:"conv_type"`    // individual|group
	TargetDisplayName  string `json:"target_display_name,omitempty"`
	CreatedAt          string `json:"created_at"`
}

func (s *Store) CreateConversation(c *Conversation) error {
	_, err := s.db.Exec(
		"INSERT OR REPLACE INTO conversations (id, integration_id, conv_type, target_display_name) VALUES (?, ?, ?, ?)",
		c.ID, c.IntegrationID, c.ConvType, c.TargetDisplayName)
	return err
}

func (s *Store) GetConversation(id string) (*Conversation, error) {
	c := &Conversation{}
	err := s.db.QueryRow(
		"SELECT id, integration_id, conv_type, COALESCE(target_display_name,''), created_at FROM conversations WHERE id = ?",
		id).Scan(&c.ID, &c.IntegrationID, &c.ConvType, &c.TargetDisplayName, &c.CreatedAt)
	if err == sql.ErrNoRows { return nil, nil }
	return c, err
}

func (s *Store) ListConversations(integrationID string) ([]*Conversation, error) {
	var rows *sql.Rows
	var err error
	if integrationID == "" {
		rows, err = s.db.Query("SELECT id, integration_id, conv_type, COALESCE(target_display_name,''), created_at FROM conversations ORDER BY created_at DESC")
	} else {
		rows, err = s.db.Query("SELECT id, integration_id, conv_type, COALESCE(target_display_name,''), created_at FROM conversations WHERE integration_id = ? ORDER BY created_at DESC", integrationID)
	}
	if err != nil { return nil, err }
	defer rows.Close()
	var result []*Conversation
	for rows.Next() {
		c := &Conversation{}
		if err := rows.Scan(&c.ID, &c.IntegrationID, &c.ConvType, &c.TargetDisplayName, &c.CreatedAt); err != nil {
			return nil, err
		}
		result = append(result, c)
	}
	return result, rows.Err()
}

func (s *Store) UpdateConversation(c *Conversation) error {
	_, err := s.db.Exec(
		"UPDATE conversations SET conv_type = ?, target_display_name = ? WHERE id = ?",
		c.ConvType, c.TargetDisplayName, c.ID)
	return err
}

func (s *Store) DeleteConversation(id string) error {
	_, err := s.db.Exec("DELETE FROM conversations WHERE id = ?", id)
	return err
}

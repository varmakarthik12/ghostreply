package db

import (
	"database/sql"
	"github.com/google/uuid"
)

type IdentityLink struct {
	ID                     string `json:"id"`
	PrimaryIntegrationID   string `json:"primary_integration_id"`
	PrimarySenderID        string `json:"primary_sender_id"`
	LinkedIntegrationID    string `json:"linked_integration_id"`
	LinkedSenderID         string `json:"linked_sender_id"`
	UnifiedDisplayName     string `json:"unified_display_name,omitempty"`
	Notes                  string `json:"notes,omitempty"`
	CreatedAt              string `json:"created_at"`
}

func (s *Store) CreateIdentityLink(l *IdentityLink) error {
	_, err := s.db.Exec(
		`INSERT INTO identity_links (id, primary_integration_id, primary_sender_id, linked_integration_id, linked_sender_id, unified_display_name, notes)
		 VALUES (?, ?, ?, ?, ?, COALESCE(?, ''), COALESCE(?, ''))`,
		uuid.NewString(), l.PrimaryIntegrationID, l.PrimarySenderID, l.LinkedIntegrationID, l.LinkedSenderID, l.UnifiedDisplayName, l.Notes)
	return err
}

func (s *Store) GetIdentityLinks() ([]*IdentityLink, error) {
	rows, err := s.db.Query("SELECT id, primary_integration_id, primary_sender_id, linked_integration_id, linked_sender_id, COALESCE(unified_display_name,''), COALESCE(notes,''), created_at FROM identity_links")
	if err != nil { return nil, err }
	defer rows.Close()
	var result []*IdentityLink
	for rows.Next() {
		l := &IdentityLink{}
		if err := rows.Scan(&l.ID, &l.PrimaryIntegrationID, &l.PrimarySenderID, &l.LinkedIntegrationID, &l.LinkedSenderID, &l.UnifiedDisplayName, &l.Notes, &l.CreatedAt); err != nil {
			return nil, err
		}
		result = append(result, l)
	}
	return result, rows.Err()
}

func (s *Store) DeleteIdentityLink(id string) error {
	_, err := s.db.Exec("DELETE FROM identity_links WHERE id = ?", id)
	return err
}

func (s *Store) GetLinkedIdentity(primaryIntID, primarySenderID string) (*IdentityLink, error) {
	l := &IdentityLink{}
	err := s.db.QueryRow(
		`SELECT id, primary_integration_id, primary_sender_id, linked_integration_id, linked_sender_id, COALESCE(unified_display_name,''), COALESCE(notes,''), created_at
		 FROM identity_links WHERE primary_integration_id = ? AND primary_sender_id = ?`,
		primaryIntID, primarySenderID).Scan(&l.ID, &l.PrimaryIntegrationID, &l.PrimarySenderID, &l.LinkedIntegrationID, &l.LinkedSenderID, &l.UnifiedDisplayName, &l.Notes, &l.CreatedAt)
	if err == sql.ErrNoRows { return nil, nil }
	return l, err
}

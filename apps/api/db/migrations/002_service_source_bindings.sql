BEGIN;

CREATE TABLE service_source_bindings (
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    source VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    external_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (source, resource_type, external_id)
);

CREATE INDEX idx_service_source_bindings_service_id
    ON service_source_bindings(service_id);

COMMIT;
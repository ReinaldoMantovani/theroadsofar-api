import { MigrationInterface, QueryRunner } from 'typeorm';
// bcrypt hash de "Admin@2025!" com 12 rounds
// IMPORTANTE: troque a senha após o primeiro login!
const ADMIN_EMAIL = 'admin@theroadsofar.com.br';
const ADMIN_HASH = '$2b$12$8wk22fvt48XlGIMRP8MWq.vMJNsPSNv/IIqs2KRPQzWmSE8z1J3dq';

export class SeedAdmin1700000000001 implements MigrationInterface {
  name = 'SeedAdmin1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Verificar se já existe
    const [existing] = await queryRunner.query(
      'SELECT id FROM users WHERE email = ? LIMIT 1',
      [ADMIN_EMAIL],
    );
    if (existing) return;

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    await queryRunner.query(`
      INSERT INTO users (email, password_hash, roles, is_active, email_verified,
        consent_terms_at, consent_privacy_at, created_at, updated_at)
      VALUES (?, ?, 'ADMIN', 1, 1, ?, ?, ?, ?)
    `, [ADMIN_EMAIL, ADMIN_HASH, now, now, now, now]);

    const [user] = await queryRunner.query('SELECT id FROM users WHERE email = ? LIMIT 1', [ADMIN_EMAIL]);

    await queryRunner.query(`
      INSERT INTO user_profiles (user_id, display_name, created_at, updated_at)
      VALUES (?, 'Administrador', ?, ?)
    `, [user.id, now, now]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DELETE FROM users WHERE email = ?', [ADMIN_EMAIL]);
  }
}

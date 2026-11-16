import { MigrationInterface, QueryRunner } from 'typeorm';

// O hash original da SeedAdmin não correspondia à senha documentada "Admin@2025!",
// impedindo o login no painel admin. Esta migration só altera a senha se o
// hash ainda for o antigo (quebrado) — se você já trocou a senha, nada muda.
const ADMIN_EMAIL = 'admin@theroadsofar.com.br';
const BROKEN_HASH = '$2b$12$pUv6EQvJ0E4Y9gk5GzJ6DOsZlcTXP6Q3Yxt6N.L4EIRnDl15YRPQO';
const FIXED_HASH = '$2b$12$8wk22fvt48XlGIMRP8MWq.vMJNsPSNv/IIqs2KRPQzWmSE8z1J3dq'; // "Admin@2025!" — troque após o primeiro login!

export class FixAdminPasswordHash1700000000002 implements MigrationInterface {
  name = 'FixAdminPasswordHash1700000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'UPDATE users SET password_hash = ? WHERE email = ? AND password_hash = ?',
      [FIXED_HASH, ADMIN_EMAIL, BROKEN_HASH],
    );
  }

  public async down(): Promise<void> {
    // não restaura um hash inválido
  }
}

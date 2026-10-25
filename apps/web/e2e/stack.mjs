// Test accounts and clean-up, made inside the backend container so the tests never touch real accounts or data.
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function django(script) {
  const out = execFileSync('docker', ['compose', 'exec', '-T', 'backend', 'python', 'manage.py', 'shell'], {
    cwd: ROOT, input: script, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  });
  const line = out.split('\n').find((l) => l.startsWith('E2E_JSON'));
  if (!line) throw new Error(`The backend didn't answer:\n${out}`);
  return JSON.parse(line.slice('E2E_JSON'.length));
}

/**
 * Makes an admin, a staff member and a buyer for this run, each with a password and a ready login.
 * Everything the tests make is named e2e-… (accounts) or "E2E …" (shelves, products, couriers),
 * so the clean-up can find it, including leftovers from a run that stopped halfway.
 */
export function setUp(tag) {
  return django(`
import json, secrets
from rest_framework_simplejwt.tokens import RefreshToken
from accounts.models import User
from accounts.views import UserSerializer
from core.models import ShopSettings

def make(kind, role, name, phone):
    email = f"e2e-{kind}-${tag}@example.com"
    password = secrets.token_urlsafe(12)
    user = User(username=email, email=email, role=role, first_name=name, phone=phone)
    user.set_password(password)
    user.save()
    token = RefreshToken.for_user(user)
    return {"email": email, "password": password, "access": str(token.access_token), "refresh": str(token),
            "user": UserSerializer(user).data}

shop = ShopSettings.load()
out = {"admin": make("admin", "admin", "E2E Admin", "9000000001"),
       "staff": make("staff", "staff", "E2E Staff", "9000000002"),
       "buyer": make("buyer", "customer", "E2E Buyer", "9000000003"),
       "addedUpi": not shop.upi_id}
# UPI checkout needs a UPI ID; a made-up one is used only if the shop has none, and removed afterwards.
if not shop.upi_id:
    shop.upi_id = "e2e.demo@sample"
    shop.save(update_fields=["upi_id"])
print("E2E_JSON" + json.dumps(out))
`);
}

export function tearDown({ addedUpi = false } = {}) {
  return django(`
import json
from accounts.models import User
from catalog.models import Category, Product
from core.models import ShopSettings
from orders.models import Courier, Order

users = User.objects.filter(email__startswith="e2e-", email__endswith="@example.com")
gone = {"orders": Order.objects.filter(user__in=users).delete()[0]}
gone["users"] = users.delete()[0]
gone["products"] = Product.objects.filter(name__startswith="E2E ").delete()[0]
gone["shelves"] = Category.objects.filter(name__startswith="E2E ").delete()[0]
gone["couriers"] = Courier.objects.filter(name__startswith="E2E ").delete()[0]
if ${addedUpi ? 'True' : 'False'}:
    shop = ShopSettings.load()
    shop.upi_id = ""
    shop.save(update_fields=["upi_id"])
print("E2E_JSON" + json.dumps(gone))
`);
}

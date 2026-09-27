import Capacitor
import StoreKit

// "Buy me a coffee" in the iPhone app: Apple wants tips inside apps paid through In-App Purchase (App Review 3.1.1),
// so here the coffees are consumable products (App Store Connect → In-App Purchases, ids in src/lib/coffee.ts) bought
// with StoreKit 2. A tip unlocks nothing, so there is nothing to restore and no server to tell.
@objc(CoffeePlugin)
public class CoffeePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CoffeePlugin"
    public let jsName = "Coffee"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "products", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "buy", returnType: CAPPluginReturnPromise),
    ]
    private var updates: Task<Void, Never>?

    override public func load() {
        // purchases that complete outside buy() (e.g. approved later via Ask to Buy): finish them, as Apple asks
        updates = Task {
            for await update in Transaction.updates {
                // unverified too: a tip unlocks nothing, and an unfinished one would come back at every launch
                switch update {
                case .verified(let transaction), .unverified(let transaction, _): await transaction.finish()
                }
            }
        }
    }

    /// the coffees with their price in the player's App Store currency
    @objc func products(_ call: CAPPluginCall) {
        let ids = call.getArray("ids", String.self) ?? []
        Task {
            do {
                let list = try await Product.products(for: ids)
                call.resolve(["products": list.map { ["id": $0.id, "price": $0.displayPrice] }])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    /// Apple's payment sheet; resolves with purchased, pending (waiting for a parent) or cancelled
    @objc func buy(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { return call.reject("no product id") }
        Task {
            do {
                guard let product = try await Product.products(for: [id]).first else { return call.reject("unknown product") }
                switch try await product.purchase() {
                case .success(let result):
                    switch result {
                    case .verified(let transaction): await transaction.finish()
                    case .unverified(let transaction, _):
                        await transaction.finish() // nothing to take back: a tip unlocks nothing
                        return call.reject("unverified purchase")
                    }
                    call.resolve(["status": "purchased"])
                case .pending:
                    call.resolve(["status": "pending"])
                default:
                    call.resolve(["status": "cancelled"])
                }
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }
}
